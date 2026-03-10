import * as mm from 'music-metadata';
import { glob } from 'glob';
import path from 'path';
import fs from 'fs';
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
    const dataDir = path.join(process.cwd(), 'data', 'covers');
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    for (const filePath of files) {
      try {
        const metadata = await mm.parseFile(filePath);
        const { artist, album, date, genre, year } = metadata.common;

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

          // 2. Prepare rich metadata
          const folderPath = path.dirname(filePath);
          const albumMeta = {
            format: metadata.format.container || 'Unknown',
            bitrate: metadata.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : null,
            sampleRate: metadata.format.sampleRate,
            genre: genre && genre.length > 0 ? genre[0] : null,
            duration: metadata.format.duration,
            fileCount: (await glob('**/*.{flac,mp3,m4a,wav}', { cwd: folderPath })).length,
            hasCover: metadata.common.picture && metadata.common.picture.length > 0
          };

          // 3. Album Upsert (Unique by artist and name)
          const albumResult = db.prepare(`
            INSERT INTO albums (artist_id, name, release_date, quality, path, status, metadata)
            VALUES (?, ?, ?, ?, ?, 'downloaded', ?)
            ON CONFLICT(artist_id, name) DO UPDATE SET
              path = excluded.path,
              status = 'downloaded',
              metadata = excluded.metadata
          `).run(
            artistId, 
            album, 
            date || year || null, 
            metadata.format.container || 'Unknown', 
            folderPath,
            JSON.stringify(albumMeta)
          );

          // 5. Handle Cover Art
          const albumRecord = db.prepare('SELECT id FROM albums WHERE artist_id = ? AND name = ?').get(artistId, album) as any;
          if (!albumRecord) continue;
          const albumId = albumRecord.id;
          
          const coverPath = path.join(dataDir, `album_${albumId}.jpg`);
          
          // Save cover if it doesn't exist yet
          if (!fs.existsSync(coverPath)) {
            if (metadata.common.picture && metadata.common.picture.length > 0) {
              console.log(`Found embedded cover for ${album}`);
              const picture = metadata.common.picture[0];
              fs.writeFileSync(coverPath, picture.data);
            } else {
              // Try to find cover.jpg or folder.jpg in the same directory
              const localCovers = await glob('{cover,folder,front}.{jpg,jpeg,png}', { cwd: folderPath, nocase: true });
              if (localCovers.length > 0) {
                console.log(`Found local cover file for ${album}: ${localCovers[0]}`);
                const localPath = path.join(folderPath, localCovers[0]);
                fs.copyFileSync(localPath, coverPath);
              }
            }
          }

          // 6. Track Upsert
          db.prepare(`
            INSERT INTO tracks (album_id, title, number, disc, duration, quality, bitrate, path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(album_id, title, number, disc) DO UPDATE SET
              path = excluded.path,
              quality = excluded.quality,
              bitrate = excluded.bitrate
          `).run(
            albumId,
            metadata.common.title || path.basename(filePath),
            metadata.common.track.no || 0,
            metadata.common.disk.no || 1,
            metadata.format.duration || 0,
            metadata.format.container || 'Unknown',
            metadata.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : null,
            filePath
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
