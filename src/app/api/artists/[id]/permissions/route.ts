import { NextResponse } from 'next/server';
import db from '@/lib/db';
import path from 'path';
import fs from 'fs';

function applyOwnership(targetPath: string, uid: number, gid: number) {
  try {
    const stat = fs.statSync(targetPath);
    if (uid !== 0 && gid !== 0) {
      try {
        fs.chownSync(targetPath, uid, gid);
      } catch (e) {
        // Ignorer silencieusement si pas les droits de chown
      }
    }
    
    try {
      fs.chmodSync(targetPath, stat.isDirectory() ? 0o777 : 0o666);
    } catch (e) {
      console.warn(`Impossible de modifier les permissions pour ${targetPath}:`, e);
    }

    if (stat.isDirectory()) {
      const files = fs.readdirSync(targetPath);
      for (const file of files) {
        applyOwnership(path.join(targetPath, file), uid, gid);
      }
    }
  } catch (e) {
    console.error(`Erreur d'accès à ${targetPath}:`, e);
  }
}

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
    const settings = db.prepare('SELECT value FROM settings WHERE key = ?').get('library_path') as { value: string } | undefined;
    const musicPath = settings?.value;
    
    // 1. Tenter via un album existant
    const album = db.prepare('SELECT path FROM albums WHERE artist_id = ? AND path IS NOT NULL LIMIT 1').get(id) as { path: string } | undefined;
    if (album && album.path) {
      artistPath = path.dirname(album.path);
    } else if (musicPath) {
      // 2. Tenter via le nom de l'artiste dans le dossier musique
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

    if (!artistPath || !fs.existsSync(artistPath)) {
      return NextResponse.json({ error: 'Dossier de l\'artiste non trouvé sur le disque' }, { status: 404 });
    }

    // Récupérer le proprio/groupe du dossier racine de musique pour les répliquer
    let uid = 0;
    let gid = 0;
    try {
      if (musicPath && fs.existsSync(musicPath)) {
        const rootStat = fs.statSync(musicPath);
        uid = rootStat.uid;
        gid = rootStat.gid;
      }
    } catch(e) {}

    // Lancer la correction de permissions (récursive)
    applyOwnership(artistPath, uid, gid);

    return NextResponse.json({ success: true, message: 'Permissions corrigées avec succès (777 pour les dossiers, 666 pour les fichiers).' });
  } catch (error: any) {
    console.error('Permissions API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
