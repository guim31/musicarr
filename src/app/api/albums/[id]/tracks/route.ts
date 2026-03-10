import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: albumId } = await params;
    const tracks = db.prepare(`
      SELECT * FROM tracks 
      WHERE album_id = ? 
      ORDER BY disc ASC, number ASC
    `).all(albumId);

    // Parse metadata if needed
    const tracksProcessed = tracks.map((track: any) => ({
      ...track,
      metadata: track.metadata ? JSON.parse(track.metadata) : {}
    }));

    return NextResponse.json(tracksProcessed);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
