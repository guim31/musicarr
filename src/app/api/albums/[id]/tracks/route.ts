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

    // Aucune piste locale : on tente les identifiants externes.
    //
    // Ce repli ne pouvait pas se déclencher tant que `albums.mbid` et
    // l'identifiant Deezer n'étaient écrits nulle part ; la synchronisation
    // les reporte désormais sur l'album.
    if (tracksProcessed.length === 0) {
      const album = db
        .prepare('SELECT mbid, deezer_id, metadata FROM albums WHERE id = ?')
        .get(albumId) as { mbid: string | null; deezer_id: string | null; metadata: string | null } | undefined;
      if (album) {
        let meta: any = {};
        try { meta = album.metadata ? JSON.parse(album.metadata) : {}; } catch {}
        meta.deezerId = album.deezer_id || meta.deezerId;

        if (album.mbid || meta.deezerId) {
          try {
            const engine = new MetadataEngine();
            const remoteTracks = await engine.getAlbumTracks(album.mbid ?? undefined, meta.deezerId);
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
