import { MetadataProvider, RemoteAlbum, RemoteArtist, RemoteTrack } from '../types';

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

  async getArtistAlbums(deezerArtistId: string, onProgress?: (current: number, total: number) => void): Promise<RemoteAlbum[]> {
    let allAlbums: any[] = [];
    let index = 0;
    let total = 0;

    do {
      const data = await this.fetchDeezer(`artist/${deezerArtistId}/albums`, { 
        limit: '100',
        index: index.toString()
      });

      if (!data || !data.data) break;

      total = data.total || 0;
      const albums = data.data;
      allAlbums = [...allAlbums, ...albums];

      index += albums.length;
      if (onProgress) onProgress(allAlbums.length, total);

      if (index < total) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } while (index < total && index < 1000);

    return allAlbums.map((r: any) => {
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

  async getAlbumTracks(deezerAlbumId: string): Promise<RemoteTrack[]> {
    const data = await this.fetchDeezer(`album/${deezerAlbumId}/tracks`, { limit: '100' });
    if (!data || !data.data) return [];

    return data.data.map((t: any) => ({
      name: t.title,
      deezerId: t.id.toString(),
      number: t.track_position || 0,
      disc: t.disk_number || 1,
      duration: t.duration || 0,
      artistName: t.artist?.name || '',
    }));
  }

  async searchAlbum(query: string): Promise<RemoteAlbum[]> {
    const data = await this.fetchDeezer('search/album', { q: query });
    if (!data || !data.data) return [];

    return data.data.slice(0, 10).map((r: any) => ({
      name: r.title,
      deezerId: r.id.toString(),
      releaseDate: r.release_date || undefined,
      artistName: r.artist?.name || '',
      type: 'album',
      image: r.cover_xl || r.cover_medium || r.cover,
    }));
  }
}
