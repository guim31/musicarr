import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { CompareUtils } from '@/lib/CompareUtils';
import { MetadataEngine } from '@/services/metadata/MetadataEngine';
import type { RemoteTrack } from '@/services/metadata/types';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const album = db
      .prepare(
        `SELECT albums.id, albums.name, albums.artist_id, albums.mbid, albums.deezer_id,
                albums.metadata, artists.name AS artist_name
           FROM albums JOIN artists ON albums.artist_id = artists.id
          WHERE albums.id = ?`,
      )
      .get(id) as
      | {
          id: number;
          name: string;
          artist_id: number;
          mbid: string | null;
          deezer_id: string | null;
          metadata: string | null;
          artist_name: string;
        }
      | undefined;

    if (!album) {
      return NextResponse.json({ error: 'Album non trouvé' }, { status: 404 });
    }

    const engine = new MetadataEngine();
    let mbid = album.mbid ?? undefined;
    let deezerId = album.deezer_id ?? undefined;

    if (!deezerId) {
      try {
        const meta = album.metadata ? JSON.parse(album.metadata) : {};
        if (typeof meta?.deezerId === 'string') deezerId = meta.deezerId;
      } catch {
        // Métadonnées illisibles : on continue sans.
      }
    }

    // 1. Les identifiants portés par la discographie synchronisée. Ils sont
    //    désormais reportés sur l'album local à la synchronisation, mais on
    //    retombe sur la table des sorties si le report n'a pas eu lieu.
    if (!mbid && !deezerId) {
      const known = db
        .prepare(
          `SELECT mbid, deezer_id FROM artist_releases
            WHERE artist_id = ? AND release_key = ?`,
        )
        .get(album.artist_id, CompareUtils.releaseKey(album.name)) as
        | { mbid: string | null; deezer_id: string | null }
        | undefined;
      mbid = known?.mbid ?? undefined;
      deezerId = known?.deezer_id ?? undefined;
    }

    let tracks: RemoteTrack[] = [];
    if (mbid || deezerId) {
      tracks = await engine.getAlbumTracks(mbid, deezerId);
    }

    // 2. Recherche ciblée en dernier recours — et non plus une discographie
    //    complète rapprochée par sous-chaîne, qui associait « Live » à
    //    « Live After Death ».
    if (tracks.length === 0) {
      const release = await engine.findRelease(album.artist_name, album.name);
      if (release?.deezerId || release?.mbid) {
        tracks = await engine.getAlbumTracks(release.mbid, release.deezerId);
      }
    }

    if (tracks.length === 0) {
      return NextResponse.json({ error: 'Aucune suggestion trouvée sur Internet' }, { status: 404 });
    }

    return NextResponse.json({
      suggestions: tracks.map(t => ({
        number: t.number,
        title: t.name,
        artist: t.artistName || album.artist_name,
      })),
    });
  } catch (error) {
    console.error('[Suggestion tags] Erreur :', error);
    return NextResponse.json({ error: 'Impossible de chercher des suggestions' }, { status: 500 });
  }
}
