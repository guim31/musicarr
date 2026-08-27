import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import type { ReleaseType } from '@/services/metadata/releaseTypes';

export const dynamic = 'force-dynamic';

interface ReleaseRow {
  id: number;
  release_key: string;
  title: string;
  type: ReleaseType;
  first_release_date: string | null;
  image: string | null;
  mbid: string | null;
  discogs_id: string | null;
  deezer_id: string | null;
  sources: string | null;
  album_id: number | null;
  monitored: number;
  album_status: string | null;
}

interface CacheRow {
  provider: string;
  status: string;
  message: string | null;
  scope: string | null;
  item_count: number;
  updated_at: string;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const artistId = Number.parseInt(id, 10);
    if (!Number.isInteger(artistId)) {
      return NextResponse.json({ error: 'Identifiant d’artiste invalide' }, { status: 400 });
    }

    // Le rapprochement « possédé / manquant » est désormais résolu à la
    // synchronisation et stocké sur la ligne. L'API ne recalcule plus rien :
    // elle lisait auparavant trois blobs JSON et les comparait à chaque album
    // local, à chaque affichage — de l'ordre de 900 000 comparaisons pour une
    // discographie fournie.
    const releases = db
      .prepare(
        `SELECT r.id, r.release_key, r.title, r.type, r.first_release_date, r.image,
                r.mbid, r.discogs_id, r.deezer_id, r.sources, r.album_id, r.monitored,
                a.status AS album_status
           FROM artist_releases r
           LEFT JOIN albums a ON a.id = r.album_id
          WHERE r.artist_id = ?
          ORDER BY COALESCE(r.first_release_date, '') DESC, r.title COLLATE NOCASE ASC`,
      )
      .all(artistId) as ReleaseRow[];

    const providers = db
      .prepare(
        `SELECT provider, status, message, scope, item_count, updated_at
           FROM artist_cache WHERE artist_id = ?`,
      )
      .all(artistId) as CacheRow[];

    const discography = releases.map(row => ({
      id: row.id,
      releaseKey: row.release_key,
      name: row.title,
      type: row.type,
      releaseDate: row.first_release_date ?? undefined,
      image: row.image ?? undefined,
      mbid: row.mbid ?? undefined,
      discogsId: row.discogs_id ?? undefined,
      deezerId: row.deezer_id ?? undefined,
      sources: parseSources(row.sources),
      localId: row.album_id ?? undefined,
      isOwned: row.album_status === 'downloaded',
      monitored: row.monitored === 1,
    }));

    const counts = discography.reduce<Record<string, number>>((acc, release) => {
      acc[release.type] = (acc[release.type] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      discography,
      counts,
      total: discography.length,
      owned: discography.filter(r => r.isOwned).length,
      // Le périmètre et l'état de chaque source sont exposés : une colonne
      // vide parce que le fournisseur a échoué ne doit plus être
      // indiscernable d'une colonne vide parce qu'il n'a rien trouvé.
      providers: providers.map(p => ({
        provider: p.provider,
        status: p.status,
        message: p.message ?? undefined,
        scope: parseScope(p.scope),
        count: p.item_count,
        updatedAt: p.updated_at,
      })),
      lastUpdate: providers.reduce<string | null>(
        (latest, p) => (!latest || p.updated_at > latest ? p.updated_at : latest),
        null,
      ),
    });
  } catch (error) {
    console.error('[Discographie] Erreur :', error);
    return NextResponse.json({ error: 'Impossible de lire la discographie' }, { status: 500 });
  }
}

function parseSources(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(s => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function parseScope(raw: string | null): { types?: string[]; deep?: boolean } | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
