import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { MetadataEngine } from '@/services/metadata/MetadataEngine';

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
    let tracksProcessed = tracks.map((track: any) => ({
      ...track,
      isLocal: true,
      metadata: track.metadata ? JSON.parse(track.metadata) : {}
    }));

    // If no local tracks, try to fetch remote ones
    if (tracksProcessed.length === 0) {
      const album = db.prepare('SELECT mbid, metadata FROM albums WHERE id = ?').get(albumId) as any;
      if (album) {
        let meta: any = {};
        try { meta = album.metadata ? JSON.parse(album.metadata) : {}; } catch {}
        
        if (album.mbid || meta.deezerId) {
          try {
            const engine = new MetadataEngine();
            const remoteTracks = await engine.getAlbumTracks(album.mbid, meta.deezerId);
            tracksProcessed = (remoteTracks || []).map((t: any) => ({
              id: `remote-${t.deezerId || t.name}-${t.number}`,
              title: t.name,
              number: t.number,
              duration: t.duration,
              isLocal: false
            }));
          } catch (remoteErr) {
            console.error('Failed to fetch remote tracks:', remoteErr);
            // On reste sur tracksProcessed vide []
          }
        }
      }
    }

    return NextResponse.json(tracksProcessed);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
