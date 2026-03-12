import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { MetadataEngine } from '@/services/metadata/MetadataEngine';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: albumId } = await params;
    
    const album = db.prepare(`
      SELECT albums.*, artists.name as artist_name 
      FROM albums 
      JOIN artists ON albums.artist_id = artists.id 
      WHERE albums.id = ?
    `).get(albumId) as any;
    
    if (!album) {
      return NextResponse.json({ error: 'Album non trouvé' }, { status: 404 });
    }

    const engine = new MetadataEngine();
    const searchResults = await engine.searchArtist(album.artist_name);
    const artist = searchResults.find(a => a.name.toLowerCase() === album.artist_name.toLowerCase());
    
    if (artist) {
      const albums = await engine.syncArtistDiscography(artist.mbid, artist.discogsId, artist.deezerId);
      const matchedAlbum = albums.find(a => 
        a.name.toLowerCase().includes(album.name.toLowerCase()) || 
        album.name.toLowerCase().includes(a.name.toLowerCase())
      );

      if (matchedAlbum && matchedAlbum.image) {
        return NextResponse.json({ coverUrl: matchedAlbum.image });
      }
    }

    return NextResponse.json({ error: 'Aucune pochette trouvée' }, { status: 404 });
  } catch (error: any) {
    console.error('Suggest Cover API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
