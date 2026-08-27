import { fetchJson } from '@/lib/http';
import type { FetchDiscographyOptions, MetadataProvider, RemoteAlbum, RemoteArtist, RemoteTrack } from '../types';
import { fromDeezer, type ReleaseType } from '../releaseTypes';

const PAGE_SIZE = 100;

/** Deezer tolère des rafales, mais rien n'oblige à en faire. */
const THROTTLE_MS = 250;

/**
 * Deezer ne sait pas filtrer par type côté serveur : c'est donc ici que la
 * distinction « parcourus » / « retenus » compte le plus. Un artiste très
 * connu peut avoir 700 singles devant ses albums ; s'arrêter à 300 éléments
 * bruts revenait à ne rapporter presque aucun album.
 */
const LIMITS = {
  normal: { kept: 300, scanned: 1500 },
  deep: { kept: 2000, scanned: 10000 },
};

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class DeezerProvider implements MetadataProvider {
  name = 'Deezer';
  private baseUrl = 'https://api.deezer.com';

  private async fetchDeezer<T>(
    endpoint: string,
    params: Record<string, string> = {},
    signal?: AbortSignal,
  ): Promise<T | null> {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    return fetchJson<T>(url, {
      headers: { 'User-Agent': BROWSER_UA },
      signal,
      throttleKey: 'deezer',
      throttleMs: THROTTLE_MS,
      nullOn4xx: true,
    });
  }

  async searchArtist(query: string, signal?: AbortSignal): Promise<RemoteArtist[]> {
    const data = await this.fetchDeezer<{ data?: Record<string, any>[] }>(
      'search/artist',
      { q: query, limit: '25' },
      signal,
    );
    if (!data?.data) return [];

    return data.data.map(a => ({
      name: a.name,
      deezerId: String(a.id),
      image: a.picture_xl || a.picture_medium || a.picture,
      source: this.name,
    }));
  }

  async getArtistAlbums(
    deezerArtistId: string,
    options: FetchDiscographyOptions = {},
  ): Promise<RemoteAlbum[]> {
    const { onProgress, types, deep, signal } = options;
    const limits = deep ? LIMITS.deep : LIMITS.normal;
    const wanted = types && types.length > 0 ? new Set<ReleaseType>(types) : null;

    const albums: RemoteAlbum[] = [];
    let index = 0;
    let total = 0;
    let scanned = 0;

    do {
      const data = await this.fetchDeezer<{ total?: number; data?: Record<string, any>[] }>(
        `artist/${deezerArtistId}/albums`,
        { limit: String(PAGE_SIZE), index: String(index) },
        signal,
      );

      const page = data?.data;
      // Page vide ou réponse illisible : on s'arrête. Sans ce garde-fou,
      // `index` n'avançait plus et la boucle tournait sur place.
      if (!page || page.length === 0) break;

      total = data?.total ?? 0;

      for (const item of page) {
        const type = fromDeezer(item.record_type);
        if (wanted && !wanted.has(type)) continue;

        albums.push({
          name: item.title,
          deezerId: String(item.id),
          releaseDate: item.release_date || undefined,
          type,
          image: item.cover_xl || item.cover_medium || item.cover,
        });
      }

      index += page.length;
      scanned += page.length;
      onProgress?.(albums.length, wanted ? Math.min(total, limits.kept) : total);
    } while (index < total && albums.length < limits.kept && scanned < limits.scanned);

    return albums;
  }

  async getAlbumTracks(deezerAlbumId: string, signal?: AbortSignal): Promise<RemoteTrack[]> {
    const data = await this.fetchDeezer<{ data?: Record<string, any>[] }>(
      `album/${deezerAlbumId}/tracks`,
      { limit: '300' },
      signal,
    );
    if (!data?.data) return [];

    return data.data.map(t => ({
      name: t.title,
      deezerId: String(t.id),
      number: t.track_position || 0,
      disc: t.disk_number || 1,
      duration: t.duration || 0,
      artistName: t.artist?.name || '',
    }));
  }

  async getAlbum(deezerAlbumId: string, signal?: AbortSignal): Promise<Record<string, any> | null> {
    return this.fetchDeezer<Record<string, any>>(`album/${deezerAlbumId}`, {}, signal);
  }

  async searchAlbum(query: string, signal?: AbortSignal): Promise<(RemoteAlbum & { artistName?: string })[]> {
    const data = await this.fetchDeezer<{ data?: Record<string, any>[] }>(
      'search/album',
      { q: query, limit: '25' },
      signal,
    );
    if (!data?.data) return [];

    return data.data.map(r => ({
      name: r.title,
      deezerId: String(r.id),
      releaseDate: r.release_date || undefined,
      artistName: r.artist?.name || '',
      type: fromDeezer(r.record_type),
      image: r.cover_xl || r.cover_medium || r.cover,
    }));
  }
}
