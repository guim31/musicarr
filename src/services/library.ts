import * as mm from 'music-metadata';
import { glob } from 'glob';
import path from 'path';
import db from '@/lib/db';

export interface ScanUpdate {
  path: string;
  artist: string;
  album: string;
  progress: number;
}

export class LibraryService {
  private static getMusicPath() {
    return db.prepare('SELECT value FROM settings WHERE key = ?').get('library_path') as { value: string } | undefined;
  }

  static async scan() {
    const musicPath = this.getMusicPath();
    if (!musicPath?.value) throw new Error('Le chemin de la bibliothèque n\'est pas configuré');

    console.log(`Scanning library at: ${musicPath.value}`);

    // Support multiple formats
    const files = await glob('**/*.{flac,mp3,m4a,wav}', { cwd: musicPath.value, absolute: true });
    
    let processedCount = 0;
    const totalCount = files.length;

    for (const filePath of files) {
      try {
        const metadata = await mm.parseFile(filePath);
        const { artist, album, date } = metadata.common;

        if (artist && album) {
          // 1. Artist Upsert
          const artistResult = db.prepare('INSERT OR IGNORE INTO artists (name) VALUES (?)').run(artist);
          let artistId: number | bigint;
          
          if (artistResult.changes > 0) {
            artistId = artistResult.lastInsertRowid;
          } else {
            const row = db.prepare('SELECT id FROM artists WHERE name = ?').get(artist) as { id: number };
            artistId = row.id;
          }

          // 2. Album Upsert (Unique by artist and name)
          db.prepare(`
            INSERT INTO albums (artist_id, name, release_date, quality, path, status)
            VALUES (?, ?, ?, ?, ?, 'downloaded')
            ON CONFLICT(artist_id, name) DO UPDATE SET
              path = excluded.path,
              status = 'downloaded'
          `).run(
            artistId, 
            album, 
            date || null, 
            metadata.format.container || 'Unknown', 
            path.dirname(filePath)
          );
        }
      } catch (err) {
        console.error(`Error parsing file ${filePath}:`, err);
      }
      
      processedCount++;
      if (processedCount % 10 === 0) {
        console.log(`Scan progress: ${processedCount}/${totalCount}`);
      }
    }

    return processedCount;
  }
}
