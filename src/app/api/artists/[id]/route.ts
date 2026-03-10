import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: artistId } = await params;
    const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(artistId);
    
    if (!artist) {
      return NextResponse.json({ error: 'Artiste non trouvé' }, { status: 404 });
    }

    return NextResponse.json(artist);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: artistId } = await params;
    const { searchParams } = new URL(request.url);
    const deleteFiles = searchParams.get('deleteFiles') === 'true';

    const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(artistId) as any;
    if (!artist) {
      return NextResponse.json({ error: 'Artiste non trouvé' }, { status: 404 });
    }

    if (deleteFiles) {
      const albums = db.prepare('SELECT id, path FROM albums WHERE artist_id = ?').all(artistId) as any[];
      const fs = (await import('fs')).default;
      const path = (await import('path')).default;
      
      const artistDirsToCleanup = new Set<string>();

      for (const album of albums) {
        // Delete album folder if it exists
        if (album.path && fs.existsSync(album.path)) {
          try {
            fs.rmSync(album.path, { recursive: true, force: true });
            artistDirsToCleanup.add(path.dirname(album.path));
          } catch (e) {
            console.error(`Error deleting album folder ${album.path}:`, e);
          }
        }
        
        // Delete cover cache if exists
        const coverPath = path.join(process.cwd(), 'data', 'covers', `album_${album.id}.jpg`);
        if (fs.existsSync(coverPath)) {
          fs.rmSync(coverPath, { force: true });
        }
      }

      // Try to delete artist directory if it's empty
      for (const dir of artistDirsToCleanup) {
        try {
          if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
            fs.rmdirSync(dir);
          }
        } catch (e) {
          console.error(`Error cleaning up artist folder ${dir}:`, e);
        }
      }
    }

    // Delete from DB (foreign keys with CASCADE will delete albums, tracks)
    db.prepare('DELETE FROM artists WHERE id = ?').run(artistId);

    db.prepare(`
      INSERT INTO activity (type, status, title, message)
      VALUES ('scan', 'completed', ?, 'Artiste supprimé')
    `).run(artist.name);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete Artist Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

