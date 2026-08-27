import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { CompareUtils } from '@/lib/CompareUtils';
import { MetadataEngine } from '@/services/metadata/MetadataEngine';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const album = db
      .prepare(
        `SELECT albums.id, albums.name, albums.artist_id, artists.name AS artist_name
           FROM albums JOIN artists ON albums.artist_id = artists.id
          WHERE albums.id = ?`,
      )
      .get(id) as { id: number; name: string; artist_id: number; artist_name: string } | undefined;

    if (!album) {
      return NextResponse.json({ error: 'Album non trouvé' }, { status: 404 });
    }

    // 1. La discographie déjà synchronisée. Elle contient la pochette dans
    //    l'immense majorité des cas — et ne coûte rien.
    //
    //    Cette route déclenchait auparavant une collecte complète chez les
    //    trois fournisseurs, sans consulter le cache : jusqu'à une minute et
    //    des centaines de requêtes externes pour une seule URL d'image.
    const cached = db
      .prepare(
        `SELECT image FROM artist_releases
          WHERE artist_id = ? AND release_key = ? AND image IS NOT NULL`,
      )
      .get(album.artist_id, CompareUtils.releaseKey(album.name)) as { image: string } | undefined;

    if (cached?.image) {
      return NextResponse.json({ coverUrl: cached.image, source: 'cache' });
    }

    // 2. À défaut, une recherche ciblée sur cette seule sortie.
    const engine = new MetadataEngine();
    const release = await engine.findRelease(album.artist_name, album.name);

    if (release?.image) {
      return NextResponse.json({ coverUrl: release.image, source: 'deezer' });
    }

    return NextResponse.json({ error: 'Aucune pochette trouvée' }, { status: 404 });
  } catch (error) {
    console.error('[Suggestion pochette] Erreur :', error);
    return NextResponse.json({ error: 'Impossible de chercher une pochette' }, { status: 500 });
  }
}
