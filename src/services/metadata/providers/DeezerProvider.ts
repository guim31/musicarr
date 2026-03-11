import { MetadataProvider, RemoteAlbum, RemoteArtist } from '../types';

export class DeezerProvider implements MetadataProvider {
  name = 'Deezer';
  private baseUrl = 'https://api.deezer.com';

  private async fetchDeezer(endpoint: string, params: Record<string, string> = {}) {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    Object.entries(params).forEach(([key, val]) => url.searchParams.append(key, val));

    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  }

  async searchArtist(query: string): Promise<RemoteArtist[]> {
    const data = await this.fetchDeezer('search/artist', { q: query });
    if (!data || !data.data) return [];

    return data.data.slice(0, 10).map((a: any) => ({
      name: a.name,
      deezerId: a.id.toString(),
      image: a.picture_xl || a.picture_medium || a.picture,
    }));
  }

  async getArtistAlbums(deezerArtistId: string): Promise<RemoteAlbum[]> {
    const data = await this.fetchDeezer(`artist/${deezerArtistId}/albums`, { limit: '100' });
    if (!data || !data.data) return [];

    return data.data.map((r: any) => {
      let type: 'album' | 'single' | 'ep' | 'compilation' = 'album';
      if (r.record_type) {
        if (r.record_type.toLowerCase() === 'single') type = 'single';
        if (r.record_type.toLowerCase() === 'ep') type = 'ep';
        if (r.record_type.toLowerCase() === 'compilation') type = 'compilation';
      }

      return {
        name: r.title,
        deezerId: r.id.toString(),
        releaseDate: r.release_date || undefined,
        type,
        image: r.cover_xl || r.cover_medium || r.cover,
      };
    });
  }
}
