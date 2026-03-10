import { MusicBrainzProvider } from './providers/MusicBrainzProvider';
import { DiscogsProvider } from './providers/DiscogsProvider';
import { RemoteAlbum, RemoteArtist } from './types';

export class MetadataEngine {
  private providers = [
    new MusicBrainzProvider(),
    new DiscogsProvider(),
  ];

  async searchArtist(query: string): Promise<RemoteArtist[]> {
    const allResults = await Promise.all(
      this.providers.map(p => p.searchArtist(query).catch(err => {
        console.error(`Provider ${p.name} search error:`, err);
        return [];
      }))
    );
    
    // Fusion intelligente par nom
    const merged = new Map<string, RemoteArtist>();
    
    for (const providerResults of allResults) {
      providerResults.forEach(a => {
        const key = a.name.toLowerCase().trim();
        if (!merged.has(key)) {
          merged.set(key, a);
        } else {
          const existing = merged.get(key)!;
          merged.set(key, { 
            ...a, 
            ...existing, // Priorise les premiers fournisseurs
            mbid: a.mbid || existing.mbid,
            discogsId: a.discogsId || existing.discogsId,
            genres: Array.from(new Set([...(a.genres || []), ...(existing.genres || [])]))
          });
        }
      });
    }

    return Array.from(merged.values());
  }

  async syncArtistDiscography(artistMbid?: string, discogsId?: string): Promise<RemoteAlbum[]> {
    const mbProvider = new MusicBrainzProvider();
    const dcProvider = new DiscogsProvider();
    
    const [mbAlbums, dcAlbums] = await Promise.all([
      artistMbid ? mbProvider.getArtistAlbums(artistMbid).catch(() => []) : [],
      discogsId ? dcProvider.getArtistAlbums(discogsId).catch(() => []) : []
    ]);

    // Fusion des discographies par titre (insensible à la casse)
    const merged = new Map<string, RemoteAlbum>();

    // On commence par MusicBrainz car c'est la source la plus "propre"
    mbAlbums.forEach(a => merged.set(a.name.toLowerCase().trim(), a));

    // On complète avec Discogs pour les releases manquantes
    dcAlbums.forEach(a => {
      const key = a.name.toLowerCase().trim();
      if (!merged.has(key)) {
        merged.set(key, a);
      } else {
        const existing = merged.get(key)!;
        merged.set(key, {
          ...existing,
          discogsId: a.discogsId,
          // On garde la date la plus ancienne trouvée pour le "first release"
          releaseDate: a.releaseDate && (!existing.releaseDate || a.releaseDate < existing.releaseDate) 
            ? a.releaseDate 
            : existing.releaseDate
        });
      }
    });

    return Array.from(merged.values()).sort((a, b) => 
      (b.releaseDate || '').localeCompare(a.releaseDate || '')
    );
  }
}
