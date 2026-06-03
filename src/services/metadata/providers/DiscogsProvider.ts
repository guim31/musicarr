import { MetadataProvider, RemoteAlbum, RemoteArtist } from '../types';
import db from '@/lib/db';

export class DiscogsProvider implements MetadataProvider {
  name = 'Discogs';
  private baseUrl = 'https://api.discogs.com';

  private getToken() {
    return (db.prepare('SELECT value FROM settings WHERE key = ?').get('discogs_token') as any)?.value;
  }

  private async fetchDiscogs(endpoint: string, params: Record<string, string> = {}) {
    const token = this.getToken();
    if (!token) return null; // Skip if no token

    const url = new URL(`${this.baseUrl}/${endpoint}`);
    params.token = token;
    Object.entries(params).forEach(([key, val]) => url.searchParams.append(key, val));

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Musicarr/0.1.0' }
    });

    if (res.status === 401) throw new Error('Token Discogs invalide');
    if (!res.ok) return null;
    return res.json();
  }

  async searchArtist(query: string): Promise<RemoteArtist[]> {
    const data = await this.fetchDiscogs('database/search', { q: query, type: 'artist' });
    if (!data) return [];

    return (data.results || []).map((a: any) => ({
      name: a.title,
      discogsId: a.id.toString(),
      image: a.cover_image,
      genres: a.genre || []
    }));
  }

  async getArtistAlbums(
    discogsArtistId: string, 
    onProgress?: (current: number, total: number) => void, 
    filterTypes?: string[],
    deep?: boolean
  ): Promise<RemoteAlbum[]> {
    let allReleases: any[] = [];
    let page = 1;
    let totalPages = 1;
    const maxPages = deep ? 50 : 5; // Limite à 5 pages (500 releases) par défaut pour éviter de figer et respecter les limites API

    do {
      const data = await this.fetchDiscogs(`artists/${discogsArtistId}/releases`, { 
        per_page: '100', 
        page: page.toString(),
        sort: 'year', 
        sort_order: 'desc' 
      });

      if (!data) break;

      totalPages = data.pagination?.pages || 1;
      const releases = data.releases || [];
      allReleases = [...allReleases, ...releases];

      if (onProgress) onProgress(allReleases.length, data.pagination?.items || allReleases.length);
      
      page++;
      // Petit délai pour l'API Discogs (60 req/min max avec auth)
      if (page <= totalPages && page <= maxPages) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } while (page <= totalPages && page <= maxPages);

    console.log(`[Discogs] Fetch terminé. Transformation de ${allReleases.length} releases...`);
    
    // On dé-duplique les résultats car Discogs renvoie TOUS les pressages (vinyle, CD, remaster...)
    // Ce qui crée des milliers de doublons pour un même album.
    const uniqueReleases = new Map<string, any>();
    
    allReleases
      .filter((r: any) => r.type === 'release' || r.type === 'master')
      .forEach((r: any) => {
        const type = (() => {
          if (r.role === 'Appearance' || r.role === 'TrackAppearance') return 'appearance';
          
          const formats = Array.isArray(r.format) ? r.format.join(',').toLowerCase() : (r.format?.toLowerCase() || '');
          const label = r.label?.toLowerCase() || '';
          
          if (formats.includes('album') || formats.includes('lp') || formats.includes('vinyl')) return 'album';
          if (formats.includes('ep')) return 'ep';
          if (formats.includes('compilation') || label.includes('compilation')) return 'compilation';
          if (formats.includes('single')) return 'single';
          
          return 'album';
        })();

        // Ignorer si ça ne correspond pas au filtre demandé par l'utilisateur
        if (filterTypes && filterTypes.length > 0 && !filterTypes.includes(type)) {
          return;
        }

        // Clé de déduplication : titre normalisé + type (pour ne pas fusionner un single et un album du même nom)
        const normalizedTitle = (r.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const dedupeKey = `${type}-${normalizedTitle}`;

        // Si on n'a pas encore cette release, on la garde.
        // Si elle existe déjà et que c'est un "master", on met à jour les données (image, ID)
        // MAIS on préserve toujours l'année de sortie la plus ancienne.
        if (!uniqueReleases.has(dedupeKey)) {
          uniqueReleases.set(dedupeKey, {
            name: r.title,
            discogsId: r.id.toString(),
            releaseDate: r.year?.toString(),
            type,
            image: r.thumb
          });
        } else if (r.type === 'master') {
          const existing = uniqueReleases.get(dedupeKey);
          // Garder la plus petite année valide
          let bestYear = existing.releaseDate;
          if (r.year && r.year > 0) {
            if (!bestYear || parseInt(r.year) < parseInt(bestYear)) {
              bestYear = r.year.toString();
            }
          }
          uniqueReleases.set(dedupeKey, {
            ...existing,
            discogsId: r.id.toString(),
            releaseDate: bestYear,
            image: r.thumb || existing.image
          });
        } else {
          // Même si on ne met pas à jour avec un master, si la release courante a une année plus ancienne, on la garde
          const existing = uniqueReleases.get(dedupeKey);
          if (r.year && r.year > 0 && (!existing.releaseDate || parseInt(r.year) < parseInt(existing.releaseDate))) {
            existing.releaseDate = r.year.toString();
          }
        }
      });

    return Array.from(uniqueReleases.values());
  }
}
