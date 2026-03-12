import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const albums = db.prepare(`
      SELECT 
        al.*, 
        ar.name as artist_name,
        (SELECT COUNT(*) FROM tracks WHERE album_id = al.id) as track_count
      FROM albums al
      LEFT JOIN artists ar ON al.artist_id = ar.id
      WHERE al.status = 'downloaded'
      ORDER BY COALESCE(al.album_artist, ar.name) ASC, al.release_date DESC
    `).all();

    return NextResponse.json(albums);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
