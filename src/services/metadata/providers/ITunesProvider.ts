import { fetchJson } from '@/lib/http';
import type { MetadataProvider, RemoteAlbum, RemoteArtist } from '../types';

export class ITunesProvider implements MetadataProvider {
  name = 'iTunes';
  private baseUrl = 'https://itunes.apple.com';

  async searchArtist(query: string, signal?: AbortSignal): Promise<RemoteArtist[]> {
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set('term', query);
    url.searchParams.set('entity', 'musicArtist');
    url.searchParams.set('limit', '25');

    const data = await fetchJson<{ results?: Record<string, any>[] }>(url, {
      signal,
      throttleKey: 'itunes',
      throttleMs: 200,
      nullOn4xx: true,
    });

    return (data?.results || []).map(a => ({
      name: a.artistName,
      itunesId: String(a.artistId),
      genres: [a.primaryGenreName].filter(Boolean),
      source: this.name,
    }));
  }

  // Helper to find a high-res image for an artist by searching their albums
  async getArtistImage(artistName: string, signal?: AbortSignal): Promise<string | undefined> {
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set('term', artistName);
    url.searchParams.set('entity', 'album');
    url.searchParams.set('limit', '1');

    const data = await fetchJson<{ results?: Record<string, any>[] }>(url, {
      signal,
      throttleKey: 'itunes',
      throttleMs: 200,
      nullOn4xx: true,
    });

    // La pochette de son album le plus populaire fait un repli honnête.
    return data?.results?.[0]?.artworkUrl100?.replace('100x100bb', '600x600bb');
  }

  async getArtistAlbums(itunesArtistId: string): Promise<RemoteAlbum[]> {
    const url = new URL(`${this.baseUrl}/lookup`);
    url.searchParams.set('id', itunesArtistId);
    url.searchParams.set('entity', 'album');

    const data = await fetchJson<{ results?: Record<string, any>[] }>(url, {
      throttleKey: 'itunes',
      throttleMs: 200,
      nullOn4xx: true,
    });

    return (data?.results || [])
      .filter(r => r.wrapperType === 'collection')
      .map(r => ({
        name: r.collectionName,
        itunesId: String(r.collectionId),
        releaseDate: r.releaseDate?.split('T')[0],
        type: 'album' as const,
        image: r.artworkUrl100?.replace('100x100bb', '600x600bb'),
      }));
  }
}
