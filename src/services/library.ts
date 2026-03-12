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

  static async scan(targetPath?: string) {
    const musicPathRes = this.getMusicPath();
    if (!musicPathRes?.value) throw new Error('Le chemin de la bibliothèque n\'est pas configuré');
    const musicPath = musicPathRes.value;

    console.log(`Scanning library at: ${targetPath || musicPath}`);

    // Indiquer immédiatement que le scan commence (seulement si scan complet)
    if (!targetPath) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('scan_progress', JSON.stringify({ processed: 0, total: -1 }));
    }

    try {
      // Si targetPath est fourni, on scanne RECURSIVEMENT ce dossier. Sinon toute la lib.
      const scanDir = targetPath || musicPath;
      const files = await glob('**/*.{flac,mp3,m4a,wav}', { cwd: scanDir, absolute: true });
      
      let processedCount = 0;
      const totalCount = files.length;
      const dataDir = path.join(process.cwd(), 'data', 'covers');
      
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Mise à jour de la progression (seulement si scan complet)
      if (!targetPath) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('scan_progress', JSON.stringify({ processed: 0, total: totalCount }));
      }

      const foundAlbumPaths = new Set<string>();
      const foundTrackPaths = new Set<string>();
      
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
          let { artist, album, date, genre, year, albumartist, bpm, barcode, isrc, label, track, disk } = metadata.common;

          // Crucial for compilations: use albumartist as the primary album reference
          const effectiveAlbumArtist = albumartist || artist || 'UNKNOWN ARTIST';

          if (!effectiveAlbumArtist || !album) {
            const folderPath = path.dirname(filePath);
            const albumFolderName = path.basename(folderPath);
            const artistFolderName = path.basename(path.dirname(folderPath));
            
            artist = artist || artistFolderName.replace(/_/g, ' ');
            album = album || albumFolderName.replace(/_/g, ' ');
          }

          if (effectiveAlbumArtist && album) {
            const artistName = effectiveAlbumArtist.toUpperCase();
            let artistId = artistIdCache.get(artistName);
            if (!artistId) {
              const artistResult = db.prepare('INSERT OR IGNORE INTO artists (name) VALUES (?)').run(artistName);
              if (artistResult.changes > 0) {
                artistId = artistResult.lastInsertRowid;
              } else {
                const row = db.prepare('SELECT id FROM artists WHERE name = ?').get(artistName) as { id: number };
                artistId = row.id;
              }
              artistIdCache.set(artistName, artistId);
            }

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

              db.prepare(`
                INSERT INTO albums (artist_id, name, album_artist, release_date, quality, path, status, barcode, label, metadata)
                VALUES (?, ?, ?, ?, ?, ?, 'downloaded', ?, ?, ?)
                ON CONFLICT(artist_id, name) DO UPDATE SET
                  path = excluded.path,
                  album_artist = excluded.album_artist,
                  status = 'downloaded',
                  quality = excluded.quality,
                  barcode = excluded.barcode,
                  label = excluded.label,
                  release_date = COALESCE(excluded.release_date, albums.release_date),
                  metadata = excluded.metadata
              `).run(
                artistId, 
                album, 
                albumartist || null,
                date || year || null, 
                metadata.format.container || 'Unknown', 
                folderPath,
                barcode || null,
                label && label.length > 0 ? label[0] : null,
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
              
              if (!albumInfo.coverHandled) {
                const coverPath = path.join(dataDir, `album_${albumId}.jpg`);
                if (!fs.existsSync(coverPath)) {
                  if (metadata.common.picture && metadata.common.picture.length > 0) {
                    const picture = metadata.common.picture[0];
                    fs.writeFileSync(coverPath, picture.data);
                  } else {
                    try {
                      const localFiles = fs.readdirSync(folderPath);
                      const coverRegex = /^(cover|folder|front)\.(png|jpe?g)$/i;
                      const localCover = localFiles.find(f => coverRegex.test(f));
                      if (localCover) {
                        const localPath = path.join(folderPath, localCover);
                        fs.copyFileSync(localPath, coverPath);
                      }
                    } catch (e) {}
                  }
                }
                albumInfo.coverHandled = true;
              }

              let trackTitle = metadata.common.title;
              let trackNumber = metadata.common.track.no || 0;

              if (!trackTitle || trackNumber === 0) {
                const fileName = path.basename(filePath, path.extname(filePath));
                const fileMatch = fileName.match(/^([0-9]+)[\s-_.]+(.*)/);
                if (fileMatch) {
                  if (trackNumber === 0) trackNumber = parseInt(fileMatch[1]);
                  if (!trackTitle) trackTitle = fileMatch[2].replace(/_/g, ' ').trim();
                } else if (!trackTitle) {
                  trackTitle = fileName.replace(/_/g, ' ').trim();
                }
              }

              db.prepare(`
                INSERT INTO tracks (album_id, title, artist, number, track_total, disc, disc_total, duration, bpm, isrc, quality, bitrate, path)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(album_id, title, number, disc) DO UPDATE SET
                  path = excluded.path,
                  artist = excluded.artist,
                  bpm = excluded.bpm,
                  isrc = excluded.isrc,
                  quality = excluded.quality,
                  bitrate = excluded.bitrate,
                  track_total = excluded.track_total,
                  disc_total = excluded.disc_total
              `).run(
                albumId,
                trackTitle,
                artist || null,
                trackNumber,
                track.of || null,
                disk.no || 1,
                disk.of || null,
                metadata.format.duration || 0,
                bpm || null,
                isrc && isrc.length > 0 ? isrc[0] : null,
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
        // Mise à jour de la progression UI seulement si scan complet
        if (!targetPath && (processedCount % 10 === 0 || processedCount === totalCount)) {
          db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('scan_progress', JSON.stringify({ processed: processedCount, total: totalCount }));
        }
      }

      // 7. Cleanup
      if (!targetPath) {
        console.log('Cleaning up missing albums and tracks...');
        const downloadedAlbums = db.prepare("SELECT id, path FROM albums WHERE status = 'downloaded'").all() as { id: number, path: string }[];
        for (const album of downloadedAlbums) {
          if (album.path && !foundAlbumPaths.has(album.path)) {
            db.prepare("UPDATE albums SET status = 'missing', path = NULL WHERE id = ?").run(album.id);
            db.prepare('DELETE FROM tracks WHERE album_id = ?').run(album.id);
          }
        }
        const allTracks = db.prepare('SELECT id, path FROM tracks').all() as { id: number, path: string }[];
        for (const track of allTracks) {
          if (track.path && !foundTrackPaths.has(track.path)) {
            db.prepare('DELETE FROM tracks WHERE id = ?').run(track.id);
          }
        }
      } else {
        // En cas de scan partiel, on ne nettoie que les fichiers disparus DANS ce dossier
        const tracksInDir = db.prepare("SELECT id, path FROM tracks WHERE path LIKE ?").all(targetPath + '%') as { id: number, path: string }[];
        for (const track of tracksInDir) {
          if (track.path && !foundTrackPaths.has(track.path)) {
            db.prepare('DELETE FROM tracks WHERE id = ?').run(track.id);
          }
        }
      }

      if (!targetPath) {
        db.prepare(`
          INSERT INTO activity (type, status, title, message)
          VALUES ('scan', 'completed', 'Scan Bibliothèque', ?)
        `).run(`Fin de scan complet : ${processedCount} fichiers traités.`);
      }

      return processedCount;
    } finally {
      if (!targetPath) {
        db.prepare('DELETE FROM settings WHERE key = ?').run('scan_progress');
      }
    }
  }
}
