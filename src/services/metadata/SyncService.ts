import db from '@/lib/db';
import { CompareUtils } from '@/lib/CompareUtils';
import { MusicBrainzProvider } from './providers/MusicBrainzProvider';
import { DiscogsProvider } from './providers/DiscogsProvider';
import { DeezerProvider } from './providers/DeezerProvider';
import { mergeDiscographies, type SourceDiscography } from './ReleaseMerger';
import { persistDiscography, type ProviderKey, type ProviderStatus } from './ReleaseStore';
import { DEFAULT_SYNC_TYPES, type ReleaseType } from './releaseTypes';
import type { FetchDiscographyOptions, RemoteAlbum, RemoteArtist } from './types';

/**
 * Issue d'un fournisseur pour une synchronisation.
 *
 * - `ok` : collecte réussie.
 * - `unmatched` : l'artiste n'a pas été identifié de façon certaine. On
 *   préfère une source vide à la discographie d'un homonyme.
 * - `skipped` : fournisseur non configuré (jeton Discogs absent).
 * - `failed` : erreur réseau ou API.
 */
export type { ProviderKey, ProviderStatus } from './ReleaseStore';

interface ProviderOutcome {
  provider: ProviderKey;
  status: ProviderStatus;
  message?: string;
  externalId?: string;
  albums: RemoteAlbum[];
}

export interface SyncOptions {
  types?: ReleaseType[] | null;
  deep?: boolean;
}

export interface SyncResult {
  releases: number;
  owned: number;
  providers: { provider: ProviderKey; status: ProviderStatus; count: number; message?: string }[];
}

/** Une discographie complète est longue ; elle ne doit pas être éternelle. */
const OVERALL_TIMEOUT_MS = { normal: 6 * 60_000, deep: 20 * 60_000 };

interface ArtistRow {
  id: number;
  name: string;
  mbid: string | null;
  discogs_id: string | null;
  deezer_id: string | null;
  metadata: string | null;
}

export class SyncService {
  /**
   * Synchronisations en cours, par artiste.
   *
   * Deux clics lançaient auparavant deux collectes concurrentes qui écrivaient
   * les mêmes lignes de cache dans un ordre non déterministe. Le verrou vit en
   * mémoire du processus, comme la synchronisation elle-même : rien à nettoyer
   * au redémarrage.
   */
  private static readonly running = new Set<number>();

  static isRunning(artistId: number): boolean {
    return SyncService.running.has(artistId);
  }

  async syncArtist(artistId: number, options: SyncOptions = {}): Promise<SyncResult> {
    if (SyncService.running.has(artistId)) {
      throw new Error('Une synchronisation est déjà en cours pour cet artiste');
    }

    const artist = db
      .prepare('SELECT id, name, mbid, discogs_id, deezer_id, metadata FROM artists WHERE id = ?')
      .get(artistId) as ArtistRow | undefined;
    if (!artist) throw new Error('Artiste non trouvé');

    const types = options.types && options.types.length > 0 ? options.types : DEFAULT_SYNC_TYPES;
    const deep = Boolean(options.deep);

    SyncService.running.add(artistId);

    // Les tâches restées « en cours » d'une exécution précédente ne
    // correspondent plus à rien : les clore avant d'en ouvrir une nouvelle.
    db.prepare(
      `UPDATE activity SET status = 'failed', message = 'Annulé par une nouvelle synchronisation'
        WHERE type = 'sync' AND artist_id = ? AND status = 'processing'`,
    ).run(artistId);

    const activityId = db
      .prepare(
        `INSERT INTO activity (type, status, title, artist_id, message, details)
         VALUES ('sync', 'processing', ?, ?, ?, ?)`,
      )
      .run(
        artist.name,
        artistId,
        `Synchronisation de la discographie de ${artist.name}…`,
        JSON.stringify({ progress: 0, provider: 'Initialisation' }),
      ).lastInsertRowid;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error('Délai de synchronisation dépassé')),
      deep ? OVERALL_TIMEOUT_MS.deep : OVERALL_TIMEOUT_MS.normal,
    );

    try {
      const progress = new Map<ProviderKey, { current: number; total: number }>();
      const publishProgress = (provider: ProviderKey, current: number, total: number) => {
        progress.set(provider, { current, total });
        const totals = Array.from(progress.values());
        const done = totals.reduce((sum, p) => sum + p.current, 0);
        const expected = totals.reduce((sum, p) => sum + Math.max(p.total, p.current), 0);
        db.prepare('UPDATE activity SET details = ? WHERE id = ?').run(
          JSON.stringify({
            progress: expected > 0 ? Math.min(99, (done / expected) * 100) : 0,
            provider,
            current: done,
            total: expected,
          }),
          activityId,
        );
      };

      const fetchOptions = (provider: ProviderKey): FetchDiscographyOptions => ({
        types,
        deep,
        signal: controller.signal,
        onProgress: (current, total) => publishProgress(provider, current, total),
      });

      // Les trois collectes tournent en parallèle : chacune a sa propre file
      // de limitation de débit, elles ne se gênent donc pas entre elles.
      const outcomes = await Promise.all([
        this.collectMusicBrainz(artist, fetchOptions('musicbrainz'), controller.signal),
        this.collectDeezer(artist, fetchOptions('deezer'), controller.signal),
        this.collectDiscogs(artist, fetchOptions('discogs'), controller.signal),
      ]);

      const sources: SourceDiscography[] = outcomes
        .filter(o => o.status === 'ok')
        .map(o => ({ provider: o.provider, albums: o.albums }));

      const releases = mergeDiscographies(sources);

      // Une seule transaction en fin de course : jusqu'ici chaque fournisseur
      // écrivait sa ligne au fil de l'eau, si bien qu'un fournisseur en échec
      // laissait silencieusement en place des données périmées, produites avec
      // d'autres filtres et à une autre date.
      const persisted = persistDiscography(artist.id, releases, outcomes, { types, deep });

      db.prepare("UPDATE activity SET status = 'completed', message = ?, details = ? WHERE id = ?").run(
        this.summarise(artist.name, persisted, outcomes),
        JSON.stringify({ progress: 100, provider: 'Terminé', current: 1, total: 1 }),
        activityId,
      );

      return {
        releases: persisted.total,
        owned: persisted.owned,
        providers: outcomes.map(o => ({
          provider: o.provider,
          status: o.status,
          count: o.albums.length,
          message: o.message,
        })),
      };
    } catch (error) {
      const message = (error as Error).message || 'Erreur inconnue';
      db.prepare("UPDATE activity SET status = 'failed', message = ? WHERE id = ?").run(
        `Échec de la synchronisation : ${message}`,
        activityId,
      );
      throw error;
    } finally {
      clearTimeout(timeout);
      SyncService.running.delete(artistId);
    }
  }

  // -------------------------------------------------------------------------
  // Identification de l'artiste chez chaque fournisseur
  // -------------------------------------------------------------------------

  /**
   * Choisit un résultat de recherche **seulement** s'il correspond exactement.
   *
   * Le repli `|| search[0]` précédent prenait le premier résultat venu quand
   * l'artiste n'était pas trouvé : un homonyme, un groupe hommage, un nom
   * proche. La colonne se remplissait alors avec la discographie de quelqu'un
   * d'autre, sans le moindre avertissement. Une source vide est préférable.
   */
  private strongMatch(candidates: RemoteArtist[], artistName: string): RemoteArtist | null {
    const wanted = CompareUtils.normalize(artistName);
    if (!wanted) return null;
    const exact = candidates.filter(c => CompareUtils.normalize(c.name) === wanted);
    if (exact.length === 0) return null;
    // Plusieurs homonymes exacts : celui que le fournisseur juge le plus
    // pertinent, à défaut de mieux.
    return exact.reduce((best, current) => ((current.score ?? 0) > (best.score ?? 0) ? current : best));
  }

  /**
   * Enregistre un identifiant externe sur l'artiste.
   *
   * Sans cela, chaque synchronisation refaisait la recherche par nom — et le
   * classement des moteurs évoluant, deux synchronisations du même artiste
   * pouvaient viser deux artistes différents.
   */
  private persistArtistId(artistId: number, column: 'mbid' | 'discogs_id' | 'deezer_id', value: string) {
    try {
      db.prepare(`UPDATE artists SET ${column} = ? WHERE id = ? AND ${column} IS NULL`).run(value, artistId);
    } catch (error) {
      // `mbid` et `discogs_id` sont uniques : l'identifiant peut déjà être
      // porté par un autre artiste. Ce n'est pas une raison d'interrompre.
      console.warn(`[Sync] ${column} non enregistré pour l'artiste ${artistId} :`, (error as Error).message);
    }
  }

  private async collectMusicBrainz(
    artist: ArtistRow,
    options: FetchDiscographyOptions,
    signal: AbortSignal,
  ): Promise<ProviderOutcome> {
    const provider = new MusicBrainzProvider();
    return this.collect('musicbrainz', artist.mbid, async () => {
      const candidates = await provider.searchArtist(artist.name, signal);
      const match = this.strongMatch(candidates, artist.name);
      if (match?.mbid) this.persistArtistId(artist.id, 'mbid', match.mbid);
      return match?.mbid ?? null;
    }, id => provider.getArtistAlbums(id, options));
  }

  private async collectDeezer(
    artist: ArtistRow,
    options: FetchDiscographyOptions,
    signal: AbortSignal,
  ): Promise<ProviderOutcome> {
    const provider = new DeezerProvider();
    return this.collect('deezer', artist.deezer_id, async () => {
      const candidates = await provider.searchArtist(artist.name, signal);
      const match = this.strongMatch(candidates, artist.name);
      if (match?.deezerId) this.persistArtistId(artist.id, 'deezer_id', match.deezerId);
      return match?.deezerId ?? null;
    }, id => provider.getArtistAlbums(id, options));
  }

  private async collectDiscogs(
    artist: ArtistRow,
    options: FetchDiscographyOptions,
    signal: AbortSignal,
  ): Promise<ProviderOutcome> {
    const provider = new DiscogsProvider();
    if (!provider.isConfigured()) {
      return {
        provider: 'discogs',
        status: 'skipped',
        message: 'Jeton Discogs non configuré',
        albums: [],
      };
    }
    return this.collect('discogs', artist.discogs_id, async () => {
      const candidates = await provider.searchArtist(artist.name, signal);
      const match = this.strongMatch(candidates, artist.name);
      if (match?.discogsId) this.persistArtistId(artist.id, 'discogs_id', match.discogsId);
      return match?.discogsId ?? null;
    }, id => provider.getArtistAlbums(id, options));
  }

  private async collect(
    provider: ProviderKey,
    knownId: string | null,
    resolveId: () => Promise<string | null>,
    fetchAlbums: (id: string) => Promise<RemoteAlbum[]>,
  ): Promise<ProviderOutcome> {
    try {
      const externalId = knownId || (await resolveId());
      if (!externalId) {
        return {
          provider,
          status: 'unmatched',
          message: 'Artiste non identifié avec certitude — source ignorée',
          albums: [],
        };
      }

      const albums = await fetchAlbums(externalId);
      return { provider, status: 'ok', externalId, albums };
    } catch (error) {
      return {
        provider,
        status: 'failed',
        message: (error as Error).message || 'Erreur inconnue',
        albums: [],
      };
    }
  }

  private summarise(artistName: string, persisted: { total: number; owned: number }, outcomes: ProviderOutcome[]) {
    const problems = outcomes
      .filter(o => o.status !== 'ok')
      .map(o => `${o.provider} : ${o.message ?? o.status}`);

    const base = `${persisted.total} sortie(s) pour ${artistName}, dont ${persisted.owned} en collection`;
    return problems.length > 0 ? `${base}. ${problems.join(' · ')}` : `${base}.`;
  }
}
