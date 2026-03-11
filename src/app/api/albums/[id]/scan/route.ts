import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { LibraryService } from '@/services/library';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const album = db.prepare('SELECT path FROM albums WHERE id = ?').get(id) as { path: string } | undefined;

    if (!album || !album.path) {
      return NextResponse.json({ error: 'Album non trouvé ou sans chemin valide' }, { status: 404 });
    }

    const processed = await LibraryService.scan(album.path);

    return NextResponse.json({ success: true, processed });
  } catch (error: any) {
    console.error('Album Scan API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
