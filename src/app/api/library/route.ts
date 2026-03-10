import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { LibraryService } from '@/services/library';

export async function GET() {
  try {
    const path = db.prepare('SELECT value FROM settings WHERE key = ?').get('library_path') as { value: string } | undefined;
    const artistsCount = db.prepare('SELECT count(*) as count FROM artists WHERE id IN (SELECT DISTINCT artist_id FROM albums WHERE status = "downloaded")').get() as { count: number };
    const albumsCount = db.prepare('SELECT count(*) as count FROM albums WHERE status = "downloaded"').get() as { count: number };

    return NextResponse.json({
      path: path?.value || '',
      stats: {
        artists: artistsCount.count,
        albums: albumsCount.count
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { action, path: newPath } = await request.json();

    if (action === 'save_path') {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .run('library_path', newPath);
      return NextResponse.json({ success: true });
    }

    if (action === 'scan') {
      // Pour une vraie application, on lancerait ça dans un "background worker"
      // ou on renverrait un ID de tâche. Pour le moment on le fait en direct.
      console.log('Starting scan...');
      const count = await LibraryService.scan();
      return NextResponse.json({ success: true, filesProcessed: count });
    }

    return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
  } catch (error: any) {
    console.error('API Library Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
