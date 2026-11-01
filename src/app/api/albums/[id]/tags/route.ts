import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/apiError';
import { TagService } from '@/services/tags';
import { PublicFetchError } from '@/lib/publicFetch';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const albumId = parseInt(id);
    const { tracks, cover } = await request.json();

    // 1. Process cover if provided
    if (cover) {
      if (typeof cover === 'string' && cover.startsWith('http')) {
        await TagService.updateAlbumCover(albumId, cover);
      } else if (typeof cover === 'string' && cover.includes('base64,')) {
        const base64Data = cover.split('base64,')[1];
        await TagService.updateAlbumCover(albumId, Buffer.from(base64Data, 'base64'));
      }
    }

    if (!Array.isArray(tracks)) {
      return NextResponse.json({ success: true }); // Case where only cover was updated
    }

    // 2. Process track updates
    const results = await TagService.updateAlbumTags(
      albumId,
      tracks.map((t: any) => ({
        ...t,
        trackId: parseInt(t.trackId)
      }))
    );

    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      console.error(`Échec de la mise à jour pour ${failures.length} pistes:`, failures);
      return NextResponse.json({ 
        success: false, 
        message: `${failures.length} piste(s) en erreur`,
        results 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    if (error instanceof PublicFetchError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Erreur API tags:", error);
    return errorResponse(error);
  }
}
