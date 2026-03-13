export interface RemoteArtist {
  name: string;
  mbid?: string;
  discogsId?: string;
  deezerId?: string;
  itunesId?: string;
  image?: string;
  genres?: string[];
  description?: string;
}

export interface RemoteAlbum {
  name: string;
  mbid?: string;
  discogsId?: string;
  deezerId?: string;
  itunesId?: string;
  releaseDate?: string;
  type?: 'album' | 'single' | 'ep' | 'compilation' | 'appearance';
  image?: string;
  trackCount?: number;
  qualities?: string[];
}

export interface RemoteTrack {
  name: string;
  deezerId?: string;
  number: number;
  disc: number;
  duration: number;
  artistName: string;
}

export interface MetadataProvider {
  name: string;
  searchArtist(query: string): Promise<RemoteArtist[]>;
  getArtistAlbums(artistId: string): Promise<RemoteAlbum[]>;
  getAlbumTracks?(albumId: string): Promise<RemoteTrack[]>;
}
