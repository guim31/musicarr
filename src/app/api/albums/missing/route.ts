import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const missingAlbums = db.prepare(`
      SELECT albums.*, artists.name as artist_name 
      FROM albums 
      JOIN artists ON albums.artist_id = artists.id 
      WHERE albums.status IN ('missing', 'wanted')
      ORDER BY artists.name ASC, albums.release_date DESC
    `).all();

    const result = missingAlbums.map((album: any) => ({
      ...album,
      metadata: album.metadata ? JSON.parse(album.metadata) : {}
    }));

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
