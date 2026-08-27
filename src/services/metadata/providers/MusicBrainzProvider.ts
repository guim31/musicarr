import { fetchJson } from '@/lib/http';
import { USER_AGENT } from '@/lib/appInfo';
import type { FetchDiscographyOptions, MetadataProvider, RemoteAlbum, RemoteArtist, RemoteTrack } from '../types';
import { fromMusicBrainz, toMusicBrainzPrimaryTypes, type ReleaseType } from '../releaseTypes';

const PAGE_SIZE = 100;

/** MusicBrainz recommande 1 requête/seconde. La marge évite les 503 en rafale. */
const THROTTLE_MS = 1100;

/**
 * Nombre de sorties **retenues** au-delà duquel on arrête de paginer, et
 * plafond de sécurité sur les sorties **parcourues**.
 *
 * La distinction est le correctif central : l'ancien plafond portait sur les
 * éléments bruts, avant filtrage par type. Sur un artiste à 900 sorties dont
 * 700 singles, on téléchargeait 500 entrées pour n'en garder que quelques
 * dizaines — et les albums au-delà du plafond étaient purement absents.
 */
const LIMITS = {
  normal: { kept: 300, scanned: 1000 },
  deep: { kept: 3000, scanned: 10000 },
};

interface ReleaseGroup {
  id: string;
  title: string;
  'first-release-date'?: string;
  'primary-type'?: string | null;
  'secondary-types'?: string[];
}

export class MusicBrainzProvider implements MetadataProvider {
  name = 'MusicBrainz';
  private baseUrl = 'https://musicbrainz.org/ws/2';

  private async fetchMB<T>(
    endpoint: string,
    params: Record<string, string> = {},
    signal?: AbortSignal,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    url.searchParams.set('fmt', 'json');
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const data = await fetchJson<T>(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal,
      throttleKey: 'musicbrainz',
      throttleMs: THROTTLE_MS,
      // Une pagination longue ne doit pas être perdue pour un seul 503.
      retries: 3,
    });

    if (data === null) throw new Error(`Réponse MusicBrainz vide pour ${endpoint}`);
    return data;
  }

  async searchArtist(query: string, signal?: AbortSignal): Promise<RemoteArtist[]> {
    const data = await this.fetchMB<{ artists?: Record<string, any>[] }>(
      'artist',
      { query, limit: '25' },
      signal,
    );

    return (data.artists || []).map(a => ({
      name: a.name,
      mbid: a.id,
      genres: (a.tags || []).map((t: { name: string }) => t.name),
      description: [a.disambiguation, a.area?.name && `Origine : ${a.area.name}`]
        .filter(Boolean)
        .join(' · '),
      source: this.name,
      score: typeof a.score === 'number' ? a.score : undefined,
    }));
  }

  async getArtistAlbums(
    artistMbid: string,
    options: FetchDiscographyOptions = {},
  ): Promise<RemoteAlbum[]> {
    const { onProgress, types, deep, signal } = options;
    const limits = deep ? LIMITS.deep : LIMITS.normal;
    const wanted = types && types.length > 0 ? new Set<ReleaseType>(types) : null;

    // Filtrage côté serveur : MusicBrainz est le seul des trois à le
    // permettre, autant ne pas rapatrier ce qu'on jettera.
    const primaryTypes = wanted ? toMusicBrainzPrimaryTypes(Array.from(wanted)) : [];

    const albums: RemoteAlbum[] = [];
    let offset = 0;
    let total = 0;
    let scanned = 0;

    do {
      const params: Record<string, string> = {
        artist: artistMbid,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      };
      if (primaryTypes.length > 0) params.type = primaryTypes.join('|');

      const data = await this.fetchMB<{
        'release-group-count'?: number;
        'release-groups'?: ReleaseGroup[];
      }>('release-group', params, signal);

      total = data['release-group-count'] ?? 0;
      const groups = data['release-groups'] ?? [];

      // Sans ce garde-fou, une page vide renvoyée avec un total non nul
      // laissait la boucle tourner indéfiniment : `offset` n'avançait plus.
      if (groups.length === 0) break;

      for (const group of groups) {
        const type = fromMusicBrainz(group['primary-type'], group['secondary-types'] ?? []);
        if (!type) continue; // interview, livre audio…
        if (wanted && !wanted.has(type)) continue;

        albums.push({
          name: group.title,
          mbid: group.id,
          releaseDate: group['first-release-date'] || undefined,
          type,
          image: `https://coverartarchive.org/release-group/${group.id}/front`,
        });
      }

      offset += groups.length;
      scanned += groups.length;
      onProgress?.(albums.length, wanted ? Math.min(total, limits.kept) : total);
    } while (offset < total && albums.length < limits.kept && scanned < limits.scanned);

    return albums;
  }

  async getAlbumTracks(releaseGroupId: string, signal?: AbortSignal): Promise<RemoteTrack[]> {
    const group = await this.fetchMB<{ releases?: { id: string }[] }>(
      `release-group/${releaseGroupId}`,
      { inc: 'releases' },
      signal,
    );

    const release = group.releases?.[0];
    if (!release) return [];

    const detail = await this.fetchMB<{
      media?: { position?: number; tracks?: Record<string, any>[] }[];
    }>(`release/${release.id}`, { inc: 'recordings+artist-credits' }, signal);

    const tracks: RemoteTrack[] = [];
    for (const medium of detail.media ?? []) {
      for (const track of medium.tracks ?? []) {
        tracks.push({
          name: track.title,
          number: track.position,
          disc: medium.position || 1,
          duration: track.length ? track.length / 1000 : 0,
          artistName: track['artist-credit']?.[0]?.name || '',
        });
      }
    }
    return tracks;
  }
}
