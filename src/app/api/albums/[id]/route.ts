import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: albumId } = await params;
    const album = db.prepare(`
      SELECT albums.*, artists.name as artist_name 
      FROM albums 
      JOIN artists ON albums.artist_id = artists.id 
      WHERE albums.id = ?
    `).get(albumId) as any;
    
    if (!album) {
      return NextResponse.json({ error: 'Album non trouvé' }, { status: 404 });
    }

    return NextResponse.json({
      ...album,
      metadata: album.metadata ? JSON.parse(album.metadata) : {}
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
