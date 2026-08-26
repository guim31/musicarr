import db from '@/lib/db';
import { fetchJson, HttpError } from '@/lib/http';
import { USER_AGENT } from '@/lib/appInfo';
import type { FetchDiscographyOptions, MetadataProvider, RemoteAlbum, RemoteArtist } from '../types';
import { fromDiscogsFormat, fromDiscogsRole, type ReleaseType } from '../releaseTypes';

const PAGE_SIZE = 100;

/** Discogs autorise 60 requêtes/minute avec jeton. */
const THROTTLE_MS = 1100;

const LIMITS = {
  normal: { kept: 300, scanned: 1200 },
  deep: { kept: 2000, scanned: 8000 },
};

interface DiscogsRelease {
  id: number;
  master_id?: number;
  title: string;
  type?: 'release' | 'master';
  role?: string;
  year?: number;
  format?: string | string[];
  thumb?: string;
}

export class DiscogsProvider implements MetadataProvider {
  name = 'Discogs';
  private baseUrl = 'https://api.discogs.com';

  private getToken(): string | undefined {
    return (db.prepare('SELECT value FROM settings WHERE key = ?').get('discogs_token') as
      | { value: string }
      | undefined)?.value;
  }

  /** Vrai si un jeton est configuré : sans lui, Discogs n'est pas interrogeable. */
  isConfigured(): boolean {
    return Boolean(this.getToken());
  }

  private async fetchDiscogs<T>(
    endpoint: string,
    params: Record<string, string> = {},
    signal?: AbortSignal,
  ): Promise<T | null> {
    const token = this.getToken();
    if (!token) return null;

    const url = new URL(`${this.baseUrl}/${endpoint}`);
    url.searchParams.set('token', token);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    try {
      return await fetchJson<T>(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal,
        throttleKey: 'discogs',
        throttleMs: THROTTLE_MS,
      });
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        throw new Error('Jeton Discogs invalide ou expiré');
      }
      throw error;
    }
  }

  async searchArtist(query: string, signal?: AbortSignal): Promise<RemoteArtist[]> {
    const data = await this.fetchDiscogs<{ results?: Record<string, any>[] }>(
      'database/search',
      { q: query, type: 'artist', per_page: '25' },
      signal,
    );
    if (!data?.results) return [];

    return data.results.map(a => ({
      name: a.title,
      discogsId: String(a.id),
      image: a.cover_image,
      genres: a.genre || [],
      source: this.name,
    }));
  }

  async getArtistAlbums(
    discogsArtistId: string,
    options: FetchDiscographyOptions = {},
  ): Promise<RemoteAlbum[]> {
    const { onProgress, types, deep, signal } = options;
    const limits = deep ? LIMITS.deep : LIMITS.normal;
    const wanted = types && types.length > 0 ? new Set<ReleaseType>(types) : null;
    const wantsAppearances = wanted ? wanted.has('appearance') : true;

    /**
     * Regroupement par master : Discogs renvoie un élément par **pressage**.
     * Dédupliquer sur le master — et non sur le titre, qui dépendait d'un type
     * mal classé — est ce qui fait tomber des milliers de lignes à quelques
     * dizaines.
     */
    const byMaster = new Map<string, RemoteAlbum>();
    let page = 1;
    let totalPages = 1;
    let scanned = 0;

    do {
      const data = await this.fetchDiscogs<{
        pagination?: { pages?: number; items?: number };
        releases?: DiscogsRelease[];
      }>(
        `artists/${discogsArtistId}/releases`,
        {
          per_page: String(PAGE_SIZE),
          page: String(page),
          sort: 'year',
          // Ordre croissant : les pressages d'origine d'abord. En décroissant,
          // les premières pages d'un artiste majeur ne contenaient que des
          // rééditions récentes, et son catalogue historique restait hors
          // plafond.
          sort_order: 'asc',
        },
        signal,
      );

      const releases = data?.releases;
      if (!releases || releases.length === 0) break;

      totalPages = data?.pagination?.pages ?? 1;

      for (const release of releases) {
        const roleKind = fromDiscogsRole(release.role);

        // Producteur, remixeur, arrangeur : ce ne sont pas ses disques.
        if (roleKind === 'credit') continue;
        if (roleKind === 'appearance' && !wantsAppearances) continue;

        const type: ReleaseType | undefined =
          roleKind === 'appearance' ? 'appearance' : (fromDiscogsFormat(release.format) ?? undefined);

        // Un type inconnu (entrées `master`, sans format) n'est pas écarté :
        // il sera résolu par les autres fournisseurs à la fusion.
        if (wanted && type && !wanted.has(type)) continue;

        const key = release.master_id ? `m${release.master_id}` : `r${release.id}`;
        const year = release.year && release.year > 0 ? String(release.year) : undefined;
        const existing = byMaster.get(key);

        if (!existing) {
          byMaster.set(key, {
            name: release.title,
            discogsId: String(release.master_id || release.id),
            releaseDate: year,
            type,
            image: release.thumb || undefined,
          });
          continue;
        }

        // Fusion des pressages : on garde la plus ancienne année connue, le
        // premier type connu, et une vignette si on n'en avait pas.
        if (year && (!existing.releaseDate || year < existing.releaseDate)) {
          existing.releaseDate = year;
        }
        existing.type ??= type;
        existing.image ||= release.thumb || undefined;
      }

      scanned += releases.length;
      page += 1;
      onProgress?.(byMaster.size, data?.pagination?.items ?? scanned);
    } while (page <= totalPages && byMaster.size < limits.kept && scanned < limits.scanned);

    return Array.from(byMaster.values());
  }
}
