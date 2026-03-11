import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { LibraryService } from '@/services/library';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const path = db.prepare('SELECT value FROM settings WHERE key = ?').get('library_path') as { value: string } | undefined;
    const progressRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('scan_progress') as { value: string } | undefined;
    const artistsCount = db.prepare("SELECT count(*) as count FROM artists WHERE id IN (SELECT DISTINCT artist_id FROM albums WHERE status = 'downloaded')").get() as { count: number };
    const albumsCount = db.prepare("SELECT count(*) as count FROM albums WHERE status = 'downloaded'").get() as { count: number };
    const readOnlyRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('read_only_mode') as { value: string } | undefined;

    // Check if filesystem is actually writable
    let isWritable = false;
    if (path?.value) {
      try {
        const fs = await import('fs');
        const pathLib = await import('path');
        const testFile = pathLib.join(path.value, '.write_test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        isWritable = true;
      } catch (e) {
        isWritable = false;
      }
    }

    return NextResponse.json({
      path: path?.value || '',
      readOnly: readOnlyRow ? readOnlyRow.value === 'true' : true, // Default to true for safety
      isWritable,
      stats: {
        artists: artistsCount.count,
        albums: albumsCount.count
      },
      progress: progressRow ? JSON.parse(progressRow.value) : null
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

    if (action === 'save_read_only') {
      const { value } = await request.json();
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .run('read_only_mode', value ? 'true' : 'false');
      return NextResponse.json({ success: true });
    }

    if (action === 'preview_path') {
      try {
        const fs = await import('fs');
        if (!fs.existsSync(newPath)) {
          return NextResponse.json({ folders: [], error: "Le chemin n'existe pas." });
        }
        const stat = fs.statSync(newPath);
        if (!stat.isDirectory()) {
          return NextResponse.json({ folders: [], error: "Le chemin n'est pas un dossier." });
        }
        const files = fs.readdirSync(newPath, { withFileTypes: true });
        const folderNames = files
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);
          
        return NextResponse.json({ 
          folders: folderNames.slice(0, 10), 
          total: folderNames.length,
          success: true
        });
      } catch (e: any) {
        return NextResponse.json({ folders: [], error: "Dossier inaccessible." });
      }
    }

    if (action === 'scan') {
      console.log('Starting scan (async)...');
      // Lancer en arrière-plan
      LibraryService.scan().catch(err => console.error('Erreur scan:', err));
      return NextResponse.json({ success: true, message: 'Scan démarré' });
    }

    return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
  } catch (error: any) {
    console.error('API Library Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
