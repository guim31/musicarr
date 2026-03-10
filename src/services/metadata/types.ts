export interface RemoteArtist {
  name: string;
  mbid?: string;
  discogsId?: string;
  image?: string;
  genres?: string[];
  description?: string;
}

export interface RemoteAlbum {
  name: string;
  mbid?: string;
  discogsId?: string;
  releaseDate?: string;
  type?: 'album' | 'single' | 'ep' | 'compilation';
  image?: string;
  trackCount?: number;
}

export interface MetadataProvider {
  name: string;
  searchArtist(query: string): Promise<RemoteArtist[]>;
  getArtistAlbums(artistId: string): Promise<RemoteAlbum[]>;
}
