import type { ReleaseType } from './releaseTypes';

export interface RemoteArtist {
  name: string;
  mbid?: string;
  discogsId?: string;
  deezerId?: string;
  itunesId?: string;
  image?: string;
  genres?: string[];
  description?: string;
  /**
   * Fournisseur d'origine. Indispensable depuis que les résultats de
   * recherche ne sont plus fusionnés entre fournisseurs : deux artistes
   * homonymes produisaient une fiche unique portant le MBID de l'un et
   * l'identifiant Deezer de l'autre.
   */
  source?: string;
  /** Score de pertinence du fournisseur, quand il en renvoie un (0–100). */
  score?: number;
}

export interface RemoteAlbum {
  name: string;
  mbid?: string;
  discogsId?: string;
  deezerId?: string;
  itunesId?: string;
  releaseDate?: string;
  /**
   * `undefined` signifie « le fournisseur ne sait pas », et non « album ».
   * Le type est alors résolu à la fusion, par les fournisseurs qui savent.
   */
  type?: ReleaseType;
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

export interface FetchDiscographyOptions {
  onProgress?: (current: number, total: number) => void;
  /** Types voulus. `null` ou absent : aucun filtre. */
  types?: ReleaseType[] | null;
  /** Parcours complet du catalogue, plus lent. */
  deep?: boolean;
  /** Annulation réelle de la pagination en cours. */
  signal?: AbortSignal;
}

export interface MetadataProvider {
  name: string;
  searchArtist(query: string, signal?: AbortSignal): Promise<RemoteArtist[]>;
  getArtistAlbums(artistId: string, options?: FetchDiscographyOptions): Promise<RemoteAlbum[]>;
  getAlbumTracks?(albumId: string): Promise<RemoteTrack[]>;
}
