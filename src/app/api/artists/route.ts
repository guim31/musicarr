import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const artists = db.prepare(`
      SELECT a.*, 
        (SELECT COUNT(*) FROM albums WHERE artist_id = a.id) as album_count,
        (SELECT COUNT(*) FROM albums WHERE artist_id = a.id AND status = 'downloaded') as downloaded_count
      FROM artists a
      ORDER BY a.name ASC
    `).all();

    return NextResponse.json(artists);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
