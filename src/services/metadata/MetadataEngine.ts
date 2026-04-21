import { MusicBrainzProvider } from './providers/MusicBrainzProvider';
import { DiscogsProvider } from './providers/DiscogsProvider';
import { DeezerProvider } from './providers/DeezerProvider';
import { ITunesProvider } from './providers/ITunesProvider';
import { RemoteAlbum, RemoteArtist } from './types';
import { CompareUtils } from '@/lib/CompareUtils';

export class MetadataEngine {
  private providers = [
    new MusicBrainzProvider(),
    new DiscogsProvider(),
    new DeezerProvider(),
    new ITunesProvider(),
  ];

  async searchArtist(query: string, providerName?: string): Promise<RemoteArtist[]> {
    const providersToUse = providerName 
      ? this.providers.filter(p => p.name.toLowerCase() === providerName.toLowerCase())
      : this.providers;

    const allResults = await Promise.all(
      providersToUse.map(p => p.searchArtist(query).catch(err => {
        console.error(`Provider ${p.name} search error:`, err);
        return [];
      }))
    );
    
    // Fusion intelligente par nom normalisé
    const merged = new Map<string, RemoteArtist>();
    
    for (const providerResults of allResults) {
      providerResults.forEach(a => {
        const key = CompareUtils.normalize(a.name);
        if (!merged.has(key)) {
          merged.set(key, a);
        } else {
          const existing = merged.get(key)!;
          merged.set(key, { 
            ...a, 
            ...existing, // Priorise les premiers fournisseurs
            image: existing.image || a.image, // Garde l'image si le provider prioritaire n'en a pas
            mbid: a.mbid || existing.mbid,
            discogsId: a.discogsId || existing.discogsId,
            deezerId: a.deezerId || existing.deezerId,
            itunesId: a.itunesId || existing.itunesId,
            genres: Array.from(new Set([...(a.genres || []), ...(existing.genres || [])]))
          });
        }
      });
    }

    const mergedResults = Array.from(merged.values());

    // Enrichissement final des images via iTunes si manquantes
    const itunes = new ITunesProvider();
    await Promise.all(mergedResults.map(async (artist) => {
      if (!artist.image) {
        artist.image = await itunes.getArtistImage(artist.name).catch(() => undefined);
      }
    }));

    return mergedResults;
  }

  async syncArtistDiscography(
    artistMbid?: string, 
    discogsId?: string, 
    deezerId?: string,
    onProgress?: (provider: string, current: number, total: number) => void
  ): Promise<RemoteAlbum[]> {
    const mbProvider = new MusicBrainzProvider();
    const dcProvider = new DiscogsProvider();
    const dzProvider = new DeezerProvider();
    
    const [mbAlbums, dcAlbums, dzAlbums] = await Promise.all([
      artistMbid ? mbProvider.getArtistAlbums(artistMbid, (c, t) => onProgress?.('MusicBrainz', c, t)).catch(() => []) : [],
      discogsId ? dcProvider.getArtistAlbums(discogsId, (c, t) => onProgress?.('Discogs', c, t)).catch(() => []) : [],
      deezerId ? dzProvider.getArtistAlbums(deezerId, (c, t) => onProgress?.('Deezer', c, t)).catch(() => []) : []
    ]);

    // Fusion des discographies par titre normalisé
    const merged = new Map<string, RemoteAlbum>();

    const typePriority = (t: string | undefined) => {
      if (t === 'album') return 10;
      if (t === 'compilation') return 8;
      if (t === 'ep') return 5;
      if (t === 'single') return 1;
      if (t === 'appearance') return 0.5;
      return 0;
    };

    const processResults = (albums: RemoteAlbum[], source: string) => {
      albums.forEach(a => {
        const key = CompareUtils.normalize(a.name);
        if (!key) return;

        if (!merged.has(key)) {
          merged.set(key, a);
        } else {
          const existing = merged.get(key)!;
          const isBetterType = typePriority(a.type) > typePriority(existing.type);
          
          merged.set(key, {
            ...existing,
            mbid: a.mbid || existing.mbid,
            discogsId: a.discogsId || existing.discogsId,
            deezerId: a.deezerId || existing.deezerId,
            type: isBetterType ? a.type : existing.type,
            // On garde la date la plus ancienne trouvée pour le "first release"
            releaseDate: a.releaseDate && (!existing.releaseDate || a.releaseDate < existing.releaseDate) 
              ? a.releaseDate 
              : existing.releaseDate,
            image: existing.image || a.image
          });
        }
      });
    };

    // Priorité à MusicBrainz, puis Discogs, puis Deezer
    processResults(mbAlbums, 'MusicBrainz');
    processResults(dcAlbums, 'Discogs');
    processResults(dzAlbums, 'Deezer');

    return Array.from(merged.values()).sort((a, b) => 
      (b.releaseDate || '').localeCompare(a.releaseDate || '')
    );
  }

  async getAlbumTracks(mbid?: string, deezerId?: string): Promise<any[]> {
    if (deezerId) {
      const dz = new DeezerProvider();
      return dz.getAlbumTracks(deezerId);
    }
    if (mbid) {
      const mb = new MusicBrainzProvider();
      return mb.getAlbumTracks(mbid);
    }
    return [];
  }
}
