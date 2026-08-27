import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@/lib/db';

const PatchBody = z.object({
  monitored: z.boolean().optional(),
  /** Rapprochement corrigé à la main : la synchronisation ne l'écrasera plus. */
  albumId: z.number().int().positive().nullable().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const releaseId = Number.parseInt(id, 10);
    if (!Number.isInteger(releaseId)) {
      return NextResponse.json({ error: 'Identifiant de sortie invalide' }, { status: 400 });
    }

    const parsed = PatchBody.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Corps de requête invalide', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const existing = db.prepare('SELECT id FROM artist_releases WHERE id = ?').get(releaseId);
    if (!existing) {
      return NextResponse.json({ error: 'Sortie non trouvée' }, { status: 404 });
    }

    const { monitored, albumId } = parsed.data;

    if (monitored !== undefined) {
      db.prepare('UPDATE artist_releases SET monitored = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(monitored ? 1 : 0, releaseId);
    }

    if (albumId !== undefined) {
      if (albumId !== null) {
        const album = db.prepare('SELECT id FROM albums WHERE id = ?').get(albumId);
        if (!album) {
          return NextResponse.json({ error: 'Album local non trouvé' }, { status: 400 });
        }
      }
      db.prepare(
        `UPDATE artist_releases
            SET album_id = ?, locked = 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
      ).run(albumId, releaseId);
    }

    const updated = db
      .prepare(
        `SELECT r.id, r.monitored, r.album_id, r.locked, a.status AS album_status
           FROM artist_releases r LEFT JOIN albums a ON a.id = r.album_id
          WHERE r.id = ?`,
      )
      .get(releaseId) as {
      id: number;
      monitored: number;
      album_id: number | null;
      locked: number;
      album_status: string | null;
    };

    return NextResponse.json({
      success: true,
      release: {
        id: updated.id,
        monitored: updated.monitored === 1,
        localId: updated.album_id ?? undefined,
        locked: updated.locked === 1,
        isOwned: updated.album_status === 'downloaded',
      },
    });
  } catch (error) {
    console.error('[Sortie] Erreur de mise à jour :', error);
    return NextResponse.json({ error: 'Impossible de mettre à jour la sortie' }, { status: 500 });
  }
}
