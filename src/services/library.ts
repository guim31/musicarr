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

    // Indiquer immédiatement que le scan commence (total à -1 signifie "calcul en cours")
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('scan_progress', JSON.stringify({ processed: 0, total: -1 }));

    try {
      // Support multiple formats
      const files = await glob('**/*.{flac,mp3,m4a,wav}', { cwd: musicPath.value, absolute: true });
      
      let processedCount = 0;
      const totalCount = files.length;
      const dataDir = path.join(process.cwd(), 'data', 'covers');
      
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Mise à jour avec le vrai total
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('scan_progress', JSON.stringify({ processed: 0, total: totalCount }));

      const foundAlbumPaths = new Set<string>();
      const foundTrackPaths = new Set<string>();
      
      // Opti: grouper les fichiers par dossier pour éviter les requêtes glob massives
      const filesByDir = new Map<string, string[]>();
      for (const f of files) {
        const dir = path.dirname(f);
        if (!filesByDir.has(dir)) filesByDir.set(dir, []);
        filesByDir.get(dir)!.push(f);
      }

      const artistIdCache = new Map<string, number | bigint>();
      const albumCache = new Map<string, { id: number, coverHandled: boolean }>();

      for (const filePath of files) {
        try {
          const metadata = await mm.parseFile(filePath);
          let { artist, album, date, genre, year } = metadata.common;

          // Fallback sur la structure des dossiers si les tags sont manquants
          if (!artist || !album) {
            const folderPath = path.dirname(filePath);
            const albumFolderName = path.basename(folderPath);
            const artistFolderName = path.basename(path.dirname(folderPath));
            
            artist = artist || artistFolderName.replace(/_/g, ' ');
            album = album || albumFolderName.replace(/_/g, ' ');
          }

          if (artist && album) {
            // 1. Artist Upsert (cached)
            let artistId = artistIdCache.get(artist);
            if (!artistId) {
              const artistResult = db.prepare('INSERT OR IGNORE INTO artists (name) VALUES (?)').run(artist);
              if (artistResult.changes > 0) {
                artistId = artistResult.lastInsertRowid;
              } else {
                const row = db.prepare('SELECT id FROM artists WHERE name = ?').get(artist) as { id: number };
                artistId = row.id;
              }
              artistIdCache.set(artist, artistId);
            }

            // 2. Prepare rich metadata (cached per album)
            const folderPath = path.dirname(filePath);
            const cacheKey = `${artistId}-${album}`;
            let albumInfo = albumCache.get(cacheKey);

            if (!albumInfo) {
              const albumMeta = {
                format: metadata.format.container || 'Unknown',
                bitrate: metadata.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : null,
                sampleRate: metadata.format.sampleRate,
                genre: genre && genre.length > 0 ? genre[0] : null,
                duration: metadata.format.duration,
                fileCount: filesByDir.get(folderPath)?.length || 1,
                hasCover: metadata.common.picture && metadata.common.picture.length > 0
              };

              // 3. Album Upsert
              db.prepare(`
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

              const albumRecord = db.prepare('SELECT id FROM albums WHERE artist_id = ? AND name = ?').get(artistId, album) as any;
              if (albumRecord) {
                albumInfo = { id: albumRecord.id, coverHandled: false };
                albumCache.set(cacheKey, albumInfo);
              }
            }

            if (albumInfo) {
              foundAlbumPaths.add(folderPath);
              const albumId = albumInfo.id;
              
              // 5. Handle Cover Art - UNIQUEMENT UNE FOIS PAR ALBUM
              if (!albumInfo.coverHandled) {
                const coverPath = path.join(dataDir, `album_${albumId}.jpg`);
                
                if (!fs.existsSync(coverPath)) {
                  if (metadata.common.picture && metadata.common.picture.length > 0) {
                    const picture = metadata.common.picture[0];
                    fs.writeFileSync(coverPath, picture.data);
                  } else {
                    // Opti: fs.readdirSync au lieu de glob
                    try {
                      const localFiles = fs.readdirSync(folderPath);
                      const coverRegex = /^(cover|folder|front)\.(png|jpe?g)$/i;
                      const localCover = localFiles.find(f => coverRegex.test(f));
                      if (localCover) {
                        const localPath = path.join(folderPath, localCover);
                        fs.copyFileSync(localPath, coverPath);
                      }
                    } catch (e) {
                      // Ignorer les erreurs d'accès dossier
                    }
                  }
                }
                albumInfo.coverHandled = true;
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
              
              foundTrackPaths.add(filePath);
            }
          }
        } catch (err) {
          console.error(`Error parsing file ${filePath}:`, err);
        }
        
        processedCount++;
        if (processedCount % 10 === 0 || processedCount === totalCount) {
          db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('scan_progress', JSON.stringify({ processed: processedCount, total: totalCount }));
        }
      }

      // 7. Cleanup
      console.log('Cleaning up missing albums and tracks...');
      
      // albums
      const downloadedAlbums = db.prepare("SELECT id, path FROM albums WHERE status = 'downloaded'").all() as { id: number, path: string }[];
      for (const album of downloadedAlbums) {
        if (album.path && !foundAlbumPaths.has(album.path)) {
          console.log(`Album not found on disk, marking as missing: ${album.path}`);
          db.prepare("UPDATE albums SET status = 'missing', path = NULL WHERE id = ?").run(album.id);
          db.prepare('DELETE FROM tracks WHERE album_id = ?').run(album.id);
        }
      }

      // tracks
      const allTracks = db.prepare('SELECT id, path FROM tracks').all() as { id: number, path: string }[];
      for (const track of allTracks) {
        if (track.path && !foundTrackPaths.has(track.path)) {
          db.prepare('DELETE FROM tracks WHERE id = ?').run(track.id);
        }
      }

      db.prepare(`
        INSERT INTO activity (type, status, title, message)
        VALUES ('scan', 'completed', 'Scan Bibliothèque', ?)
      `).run(`Fin de scan : ${processedCount} fichiers traités, ${totalCount} trouvés.`);

      return processedCount;
    } finally {
      db.prepare('DELETE FROM settings WHERE key = ?').run('scan_progress');
    }
  }
}
