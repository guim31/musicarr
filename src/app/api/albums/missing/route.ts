import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Sorties manquantes de la bibliothèque.
 *
 * Deux natures, réunies ici :
 *
 * - **`lost`** : un album jadis présent dont les fichiers ont disparu du
 *   disque. C'était jusqu'ici le seul cas possible — un album distant n'étant
 *   jamais matérialisé en base, une sortie jamais possédée ne pouvait pas
 *   apparaître dans cette liste, qui promettait pourtant l'inverse.
 * - **`never_owned`** : une sortie connue de la discographie, surveillée, et
 *   sans album local rapproché.
 */
interface MissingRow {
  kind: 'lost' | 'never_owned';
  id: string;
  albumId: number | null;
  releaseId: number | null;
  name: string;
  artistId: number;
  artistName: string;
  type: string | null;
  releaseDate: string | null;
  image: string | null;
}

export async function GET() {
  try {
    const lost = db
      .prepare(
        `SELECT albums.id, albums.name, albums.type, albums.release_date, albums.artist_id,
                artists.name AS artist_name
           FROM albums JOIN artists ON albums.artist_id = artists.id
          WHERE albums.status IN ('missing', 'wanted')`,
      )
      .all() as {
      id: number;
      name: string;
      type: string | null;
      release_date: string | null;
      artist_id: number;
      artist_name: string;
    }[];

    const neverOwned = db
      .prepare(
        `SELECT r.id, r.title, r.type, r.first_release_date, r.image, r.artist_id,
                artists.name AS artist_name
           FROM artist_releases r JOIN artists ON r.artist_id = artists.id
          WHERE r.monitored = 1 AND r.album_id IS NULL`,
      )
      .all() as {
      id: number;
      title: string;
      type: string;
      first_release_date: string | null;
      image: string | null;
      artist_id: number;
      artist_name: string;
    }[];

    const rows: MissingRow[] = [
      ...lost.map(album => ({
        kind: 'lost' as const,
        id: `album-${album.id}`,
        albumId: album.id,
        releaseId: null,
        name: album.name,
        artistId: album.artist_id,
        artistName: album.artist_name,
        type: album.type,
        releaseDate: album.release_date,
        image: null,
      })),
      ...neverOwned.map(release => ({
        kind: 'never_owned' as const,
        id: `release-${release.id}`,
        albumId: null,
        releaseId: release.id,
        name: release.title,
        artistId: release.artist_id,
        artistName: release.artist_name,
        type: release.type,
        releaseDate: release.first_release_date,
        image: release.image,
      })),
    ];

    rows.sort(
      (a, b) =>
        a.artistName.localeCompare(b.artistName, 'fr') ||
        (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''),
    );

    return NextResponse.json({
      albums: rows,
      counts: {
        total: rows.length,
        lost: lost.length,
        neverOwned: neverOwned.length,
      },
    });
  } catch (error) {
    console.error('[Manquants] Erreur :', error);
    return NextResponse.json({ error: 'Impossible de lister les sorties manquantes' }, { status: 500 });
  }
}
