import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { LibraryService } from '@/services/library';
import path from 'path';
import fs from 'fs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const artist = db.prepare('SELECT name FROM artists WHERE id = ?').get(id) as { name: string } | undefined;
    if (!artist) {
      return NextResponse.json({ error: 'Artiste non trouvé' }, { status: 404 });
    }

    // Chercher le chemin de l'artiste soit via ses albums, soit via le dossier racine
    let artistPath = '';
    
    // 1. Tenter via un album existant
    const album = db.prepare('SELECT path FROM albums WHERE artist_id = ? AND path IS NOT NULL LIMIT 1').get(id) as { path: string } | undefined;
    if (album && album.path) {
      artistPath = path.dirname(album.path);
    } else {
      // 2. Tenter via le nom de l'artiste dans le dossier musique
      const settings = db.prepare('SELECT value FROM settings WHERE key = ?').get('library_path') as { value: string } | undefined;
      if (settings?.value) {
        // On cherche un dossier qui match le nom (insensible à la casse/espaces si possible)
        const musicPath = settings.value;
        const potentialPath = path.join(musicPath, artist.name.replace(/\s+/g, '_').toUpperCase());
        if (fs.existsSync(potentialPath)) {
          artistPath = potentialPath;
        } else {
           // Fallback : recherche brute du premier dossier qui match le nom
           const items = fs.readdirSync(musicPath);
           const target = artist.name.toLowerCase().replace(/[^a-z0-9]/g, '');
           const match = items.find(item => item.toLowerCase().replace(/[^a-z0-9]/g, '') === target);
           if (match) {
             artistPath = path.join(musicPath, match);
           }
        }
      }
    }

    if (!artistPath || !fs.existsSync(artistPath)) {
      return NextResponse.json({ error: 'Dossier de l\'artiste non trouvé sur le disque' }, { status: 404 });
    }

    const processed = await LibraryService.scan(artistPath);

    return NextResponse.json({ success: true, processed });
  } catch (error: any) {
    console.error('Artist Scan API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
