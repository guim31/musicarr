import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { MetadataEngine } from '@/services/metadata/MetadataEngine';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: albumId } = await params;
    
    // 1. Récupérer les infos de l'album en BDD
    const album = db.prepare(`
      SELECT albums.*, artists.name as artist_name 
      FROM albums 
      JOIN artists ON albums.artist_id = artists.id 
      WHERE albums.id = ?
    `).get(albumId) as any;
    
    if (!album) {
      return NextResponse.json({ error: 'Album non trouvé' }, { status: 404 });
    }

    const metadata = album.metadata ? JSON.parse(album.metadata) : {};
    const engine = new MetadataEngine();

    let remoteTracks: any[] = [];

    // 2. Si on a déjà un ID externe, on l'utilise directement
    if (album.mbid || metadata.deezerId) {
      remoteTracks = await engine.getAlbumTracks(album.mbid, metadata.deezerId);
    } 
    
    // 3. Sinon, on tente une recherche par nom d'artiste + nom d'album
    if (remoteTracks.length === 0) {
      console.log(`Searching for album: ${album.artist_name} - ${album.name}`);
      const searchResults = await engine.searchArtist(album.artist_name);
      const artist = searchResults.find(a => a.name.toLowerCase() === album.artist_name.toLowerCase());
      
      if (artist) {
        const albums = await engine.syncArtistDiscography(artist.mbid, artist.discogsId, artist.deezerId);
        // Matcher l'album par nom
        const matchedAlbum = albums.find(a => 
          a.name.toLowerCase().includes(album.name.toLowerCase()) || 
          album.name.toLowerCase().includes(a.name.toLowerCase())
        );

        if (matchedAlbum) {
          remoteTracks = await engine.getAlbumTracks(matchedAlbum.mbid, matchedAlbum.deezerId);
        }
      }
    }

    if (remoteTracks.length === 0) {
      return NextResponse.json({ error: 'Aucune suggestion trouvée sur Internet' }, { status: 404 });
    }

    // On renvoie une structure simplifiée pour le front
    const suggestions = remoteTracks.map(t => ({
      number: t.number,
      title: t.name,
      artist: t.artistName || album.artist_name
    }));

    return NextResponse.json({ suggestions });
  } catch (error: any) {
    console.error('Suggest Tags API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
