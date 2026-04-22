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

    const withTimeout = <T>(promise: Promise<T[]>, providerName: string): Promise<T[]> => {
      return Promise.race([
        promise,
        new Promise<T[]>((_, reject) => setTimeout(() => reject(new Error(`Timeout ${providerName}`)), 15000))
      ]).catch(err => {
        console.warn(`Search: Provider ${providerName} failed or timed out:`, err.message);
        return [] as T[];
      });
    };

    const allResults = await Promise.all(
      providersToUse.map(p => withTimeout(p.searchArtist(query), p.name))
    );
    
    // Fusion intelligente par nom normalisé
    const merged = new Map<string, RemoteArtist>();
    
    for (const providerResults of allResults) {
      providerResults.forEach((a: RemoteArtist) => {
        const key = CompareUtils.normalize(a.name);
        if (!merged.has(key)) {
          merged.set(key, a);
        } else {
          const existing = merged.get(key)!;
          merged.set(key, { 
            ...a, 
            ...existing, // Priorise les premiers fournisseurs
            image: existing.image || a.image, // Garde l'image si le provider prioritaire n'en a pas
            mbid: existing.mbid || a.mbid,
            discogsId: existing.discogsId || a.discogsId,
            deezerId: existing.deezerId || a.deezerId,
            itunesId: existing.itunesId || a.itunesId,
            genres: Array.from(new Set([...(existing.genres || []), ...(a.genres || [])]))
          });
        }
      });
    }

    const mergedResults = Array.from(merged.values());

    // Enrichissement final des images via iTunes si manquantes (avec timeout court)
    const itunes = new ITunesProvider();
    await Promise.all(mergedResults.slice(0, 5).map(async (artist) => {
      if (!artist.image) {
        artist.image = await Promise.race<string | undefined>([
          itunes.getArtistImage(artist.name),
          new Promise<undefined>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]).catch(() => undefined);
      }
    }));

    return mergedResults;
  }

  async syncArtistDiscography(
    artistMbid?: string, 
    discogsId?: string, 
    deezerId?: string,
    onProgress?: (provider: string, current: number, total: number) => void,
    filterTypes?: string[]
  ): Promise<RemoteAlbum[]> {
    const mbProvider = new MusicBrainzProvider();
    const dcProvider = new DiscogsProvider();
    const dzProvider = new DeezerProvider();
    
    const withTimeout = <T>(promise: Promise<T[]>, providerName: string): Promise<T[]> => {
      return Promise.race([
        promise,
        new Promise<T[]>((_, reject) => setTimeout(() => reject(new Error(`Timeout ${providerName}`)), 30000))
      ]).catch(err => {
        console.warn(`Provider ${providerName} failed or timed out:`, err.message);
        return [] as T[];
      });
    };

    const providerNames = [artistMbid && 'MusicBrainz', discogsId && 'Discogs', deezerId && 'Deezer'].filter(Boolean);
    console.log(`[Sync] Starting parallel fetch for ${providerNames.join(', ')}`);
    
    const [mbAlbums, dcAlbums, dzAlbums] = await Promise.all([
      artistMbid ? withTimeout(mbProvider.getArtistAlbums(artistMbid, (c, t) => onProgress?.('MusicBrainz', c, t), filterTypes), 'MusicBrainz') : Promise.resolve([] as RemoteAlbum[]),
      discogsId ? withTimeout(dcProvider.getArtistAlbums(discogsId, (c, t) => onProgress?.('Discogs', c, t), filterTypes), 'Discogs') : Promise.resolve([] as RemoteAlbum[]),
      deezerId ? withTimeout(dzProvider.getArtistAlbums(deezerId, (c, t) => onProgress?.('Deezer', c, t), filterTypes), 'Deezer') : Promise.resolve([] as RemoteAlbum[]),
    ]);

    console.log(`[Sync] Fetch finished. MB: ${mbAlbums.length}, DC: ${dcAlbums.length}, DZ: ${dzAlbums.length}`);
    onProgress?.('Finalisation', 0, 1);

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
