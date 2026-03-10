import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const artists = db.prepare(`
      SELECT a.*, 
        (SELECT COUNT(*) FROM albums WHERE artist_id = a.id) as album_test_count,
        (SELECT COUNT(*) FROM albums WHERE artist_id = a.id AND status = 'downloaded') as downloaded_count,
        (SELECT COUNT(*) FROM albums WHERE artist_id = a.id AND status IN ('missing', 'wanted')) as missing_count
      FROM artists a
      ORDER BY a.name ASC
    `).all();

    const artistsProcessed = artists.map((a: any) => ({
      ...a,
      album_count: a.album_test_count, // Fallback alias
    }));

    return NextResponse.json(artistsProcessed);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
