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

  async getArtistAlbums(discogsArtistId: string): Promise<RemoteAlbum[]> {
    const data = await this.fetchDiscogs(`artists/${discogsArtistId}/releases`, { per_page: '100', sort: 'year', sort_order: 'desc' });
    if (!data) return [];

    return (data.releases || [])
      .filter((r: any) => r.type === 'release' || r.type === 'master')
      .map((r: any) => ({
        name: r.title,
        discogsId: r.id.toString(),
        releaseDate: r.year?.toString(),
        type: (() => {
          const fmt = r.format?.toLowerCase() || '';
          if (fmt.includes('album')) return 'album';
          if (fmt.includes('ep')) return 'ep';
          if (fmt.includes('compilation')) return 'compilation';
          return 'single';
        })() as any,
        image: r.thumb
      }));
  }
}
