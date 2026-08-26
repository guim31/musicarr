import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SyncService } from '@/services/metadata/SyncService';
import { RELEASE_TYPES } from '@/services/metadata/releaseTypes';

const SyncBody = z.object({
  types: z.array(z.enum(RELEASE_TYPES)).min(1).optional(),
  deep: z.boolean().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const artistId = Number.parseInt(id, 10);
    if (!Number.isInteger(artistId)) {
      return NextResponse.json({ error: 'Identifiant d’artiste invalide' }, { status: 400 });
    }

    const parsed = SyncBody.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Options de synchronisation invalides', details: parsed.error.issues },
        { status: 400 },
      );
    }

    if (SyncService.isRunning(artistId)) {
      return NextResponse.json(
        { error: 'Une synchronisation est déjà en cours pour cet artiste' },
        { status: 409 },
      );
    }

    // La collecte est longue : elle se poursuit en tâche de fond et rend
    // compte via la table `activity`.
    const sync = new SyncService();
    sync.syncArtist(artistId, parsed.data).catch(error => {
      console.error(`[Sync] Échec en arrière-plan pour l'artiste ${artistId} :`, error);
    });

    return NextResponse.json({ success: true, message: 'Synchronisation démarrée en arrière-plan' });
  } catch (error) {
    console.error('[Sync] Erreur :', error);
    return NextResponse.json({ error: 'Impossible de démarrer la synchronisation' }, { status: 500 });
  }
}
