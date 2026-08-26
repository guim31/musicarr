import db from '@/lib/db';
import { CompareUtils } from '@/lib/CompareUtils';
import type { MergedRelease } from './ReleaseMerger';
import type { ReleaseType } from './releaseTypes';

export type ProviderKey = 'musicbrainz' | 'deezer' | 'discogs';
export type ProviderStatus = 'ok' | 'unmatched' | 'skipped' | 'failed';

export interface ProviderOutcome {
  provider: ProviderKey;
  status: ProviderStatus;
  message?: string;
  externalId?: string;
  albums: unknown[];
}

export interface PersistScope {
  types: ReleaseType[];
  deep: boolean;
}

export interface PersistSummary {
  total: number;
  owned: number;
  pruned: number;
}

interface LocalAlbum {
  id: number;
  name: string;
  status: string;
  mbid: string | null;
  discogs_id: string | null;
  deezer_id: string | null;
}

/**
 * Écrit en base le résultat d'une synchronisation.
 *
 * Tout se fait dans **une seule transaction**. Auparavant chaque fournisseur
 * écrivait sa ligne de cache au fil de l'eau : un fournisseur en échec, ou
 * simplement non identifié, laissait silencieusement en place des données
 * périmées produites avec d'autres filtres et à une autre date. L'interface
 * comparait alors des colonnes qui n'avaient ni le même âge ni le même
 * périmètre.
 */
export function persistDiscography(
  artistId: number,
  releases: MergedRelease[],
  outcomes: ProviderOutcome[],
  scope: PersistScope,
): PersistSummary {
  const wanted = new Set(scope.types);

  const write = db.transaction((): PersistSummary => {
    for (const outcome of outcomes) {
      db.prepare(
        `INSERT INTO artist_cache (artist_id, provider, data, status, scope, message, item_count, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(artist_id, provider) DO UPDATE SET
           data = excluded.data,
           status = excluded.status,
           scope = excluded.scope,
           message = excluded.message,
           item_count = excluded.item_count,
           updated_at = CURRENT_TIMESTAMP`,
      ).run(
        artistId,
        outcome.provider,
        JSON.stringify(outcome.albums),
        outcome.status,
        JSON.stringify(scope),
        outcome.message ?? null,
        outcome.albums.length,
      );
    }

    const localAlbums = db
      .prepare('SELECT id, name, status, mbid, discogs_id, deezer_id FROM albums WHERE artist_id = ?')
      .all(artistId) as LocalAlbum[];

    // Index clé de sortie -> album local. Les albums possédés d'abord : un
    // même titre peut exister deux fois en base, on privilégie celui dont les
    // fichiers sont là.
    const byReleaseKey = new Map<string, LocalAlbum>();
    for (const album of [...localAlbums].sort((a, b) =>
      a.status === b.status ? 0 : a.status === 'downloaded' ? -1 : 1,
    )) {
      const key = CompareUtils.releaseKey(album.name);
      if (key && !byReleaseKey.has(key)) byReleaseKey.set(key, album);
    }

    const upsert = db.prepare(
      `INSERT INTO artist_releases
         (artist_id, release_key, title, type, first_release_date, image,
          mbid, discogs_id, deezer_id, sources, album_id, monitored, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(artist_id, release_key) DO UPDATE SET
         title = excluded.title,
         type = excluded.type,
         first_release_date = COALESCE(excluded.first_release_date, artist_releases.first_release_date),
         image = COALESCE(excluded.image, artist_releases.image),
         mbid = COALESCE(excluded.mbid, artist_releases.mbid),
         discogs_id = COALESCE(excluded.discogs_id, artist_releases.discogs_id),
         deezer_id = COALESCE(excluded.deezer_id, artist_releases.deezer_id),
         sources = excluded.sources,
         album_id = CASE WHEN artist_releases.locked = 1
                         THEN artist_releases.album_id
                         ELSE excluded.album_id END,
         updated_at = CURRENT_TIMESTAMP`,
    );

    let owned = 0;
    const seen: string[] = [];

    for (const release of releases) {
      const local = byReleaseKey.get(release.releaseKey);
      if (local) owned += 1;
      seen.push(release.releaseKey);

      upsert.run(
        artistId,
        release.releaseKey,
        release.title,
        release.type,
        release.firstReleaseDate ?? null,
        release.image ?? null,
        release.mbid ?? null,
        release.discogsId ?? null,
        release.deezerId ?? null,
        JSON.stringify(release.sources),
        local?.id ?? null,
        // Ce que l'utilisateur a demandé à synchroniser, il veut le suivre.
        // Posé à la création seulement : son choix ultérieur prime.
        wanted.has(release.type) ? 1 : 0,
      );

      if (local) linkLocalAlbum(local, release);
    }

    const pruned = pruneStaleReleases(artistId, scope.types, seen);
    return { total: releases.length, owned, pruned };
  });

  return write();
}

/**
 * Reporte les identifiants externes sur l'album local.
 *
 * `albums.mbid` et `albums.discogs_id` n'étaient écrits nulle part : les deux
 * premières règles de rapprochement de l'API discographie ne servaient donc à
 * rien, et « possédé ou manquant » reposait entièrement sur la comparaison de
 * chaînes.
 */
function linkLocalAlbum(local: LocalAlbum, release: MergedRelease): void {
  const mappings: [string | undefined, 'mbid' | 'discogs_id' | 'deezer_id', string | null][] = [
    [release.mbid, 'mbid', local.mbid],
    [release.discogsId, 'discogs_id', local.discogs_id],
    [release.deezerId, 'deezer_id', local.deezer_id],
  ];

  for (const [value, column, current] of mappings) {
    if (!value || current) continue;
    try {
      db.prepare(`UPDATE albums SET ${column} = ? WHERE id = ? AND ${column} IS NULL`).run(value, local.id);
    } catch (error) {
      // `mbid` et `discogs_id` sont uniques : l'identifiant peut déjà être
      // porté par un autre album. Le rapprochement par clé de sortie reste
      // valable, ce n'est donc pas une raison d'échouer.
      console.warn(`[Sync] ${column} non reporté sur l'album ${local.id} :`, (error as Error).message);
    }
  }
}

/**
 * Retire les sorties disparues des fournisseurs.
 *
 * Strictement dans le périmètre de types qui vient d'être synchronisé : une
 * synchronisation « albums + EP » ne doit pas effacer les singles collectés
 * la fois précédente. Ni les sorties possédées, ni celles corrigées à la main.
 */
function pruneStaleReleases(artistId: number, types: ReleaseType[], seen: string[]): number {
  if (types.length === 0) return 0;

  const typePlaceholders = types.map(() => '?').join(',');
  const seenClause = seen.length > 0 ? `AND release_key NOT IN (${seen.map(() => '?').join(',')})` : '';

  const result = db
    .prepare(
      `DELETE FROM artist_releases
        WHERE artist_id = ?
          AND type IN (${typePlaceholders})
          ${seenClause}
          AND album_id IS NULL
          AND locked = 0`,
    )
    .run(artistId, ...types, ...seen);

  return result.changes;
}
