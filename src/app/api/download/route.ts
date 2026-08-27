import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DownloadService, UnsupportedProtocolError } from '@/services/DownloadService';

const DownloadBody = z.object({
  url: z.string().min(1),
  title: z.string().optional(),
  protocol: z.string().optional(),
  albumId: z.coerce.number().int().positive().optional(),
});

/**
 * Conservée pour la page de recherche globale ; elle délègue désormais au
 * même service que `/api/search/download`, au lieu d'en réimplémenter une
 * version dégradée.
 */
export async function POST(request: Request) {
  try {
    const parsed = DownloadBody.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Requête de téléchargement invalide', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const result = await DownloadService.start(parsed.data);
    if (!result.success) {
      return NextResponse.json({ error: 'Le client de téléchargement a refusé la demande' }, { status: 502 });
    }

    return NextResponse.json({ success: true, activityId: result.activityId });
  } catch (error) {
    if (error instanceof UnsupportedProtocolError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[Téléchargement] Erreur :', error);
    return NextResponse.json({ error: (error as Error).message || 'Erreur interne' }, { status: 500 });
  }
}
