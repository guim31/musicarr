import { MetadataProvider, RemoteAlbum, RemoteArtist } from '../types';

export class ITunesProvider implements MetadataProvider {
  name = 'iTunes';
  private baseUrl = 'https://itunes.apple.com';

  async searchArtist(query: string): Promise<RemoteArtist[]> {
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.append('term', query);
    url.searchParams.append('entity', 'musicArtist');
    url.searchParams.append('limit', '10');

    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();

    return (data.results || []).map((a: any) => ({
      name: a.artistName,
      // iTunes IDs are numbers, we convert to string
      itunesId: a.artistId.toString(),
      genres: [a.primaryGenreName].filter(Boolean),
      // iTunes search entity 'musicArtist' doesn't return images always.
      // We might need to look for a 'musicVideo' or 'album' from the same artist to get a better image if needed,
      // but for now, we'll see if 'musicArtist' has something.
    }));
  }

  // Helper to find a high-res image for an artist by searching their albums
  async getArtistImage(artistName: string): Promise<string | undefined> {
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.append('term', artistName);
    url.searchParams.append('entity', 'album');
    url.searchParams.append('limit', '1');

    const res = await fetch(url);
    if (!res.ok) return undefined;
    const data = await res.json();
    
    if (data.results && data.results[0]) {
      // Return the artwork of its most popular album, it's often a good fallback for the artist
      return data.results[0].artworkUrl100?.replace('100x100bb', '600x600bb');
    }
    return undefined;
  }

  async getArtistAlbums(itunesArtistId: string): Promise<RemoteAlbum[]> {
    const url = new URL(`${this.baseUrl}/lookup`);
    url.searchParams.append('id', itunesArtistId);
    url.searchParams.append('entity', 'album');

    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();

    return (data.results || [])
      .filter((r: any) => r.wrapperType === 'collection')
      .map((r: any) => ({
        name: r.collectionName,
        releaseDate: r.releaseDate?.split('T')[0],
        type: 'album',
        image: r.artworkUrl100?.replace('100x100bb', '600x600bb'),
      }));
  }
}
