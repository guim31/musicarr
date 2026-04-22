import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: artistId } = await params;
    const albums = db.prepare(`
      SELECT * FROM albums 
      WHERE artist_id = ? 
      ORDER BY release_date DESC, name ASC
    `).all(artistId);

    // Parse metadata JSON
    const albumsWithMeta = albums.map((album: any) => ({
      ...album,
      metadata: album.metadata ? JSON.parse(album.metadata) : {}
    }));

    return NextResponse.json(albumsWithMeta);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
