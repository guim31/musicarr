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
      const scanDir = targetPath || musicPath;
      console.log(`[Library] Scanning directory: ${scanDir}`);
      
      if (!fs.existsSync(scanDir)) {
        console.error(`[Library] Error: Scan directory does not exist: ${scanDir}`);
        throw new Error(`Le dossier à scanner n'existe pas : ${scanDir}`);
      }

      const files = await glob('**/*.{flac,mp3,m4a,wav}', { cwd: scanDir, absolute: true });
      console.log(`[Library] Found ${files.length} audio files`);

      if (files.length === 0) {
        console.warn(`[Library] No files found in ${scanDir}`);
        return 0;
      }
      
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

      const foundAlbumIds = new Set<number>();
      const foundTrackPaths = new Set<string>();
      
      const filesByDir = new Map<string, string[]>();
      for (const f of files) {
        const dir = path.dirname(f);
        if (!filesByDir.has(dir)) filesByDir.set(dir, []);
        filesByDir.get(dir)!.push(f);
      }

      const artistIdCache = new Map<string, number | bigint>();
      const albumCache = new Map<string, { id: number, coverHandled: boolean }>();

      // Group processing by directory to handle compilations better
      const sortedDirs = Array.from(filesByDir.keys());
      
      for (const dirPath of sortedDirs) {
        const dirFiles = filesByDir.get(dirPath) || [];
        const dirMetadatas: { path: string, metadata: mm.IAudioMetadata }[] = [];
        
        // 1. Pre-parse all files in directory to detect compilation (skip covers for speed)
        for (const filePath of dirFiles) {
          try {
            const metadata = await mm.parseFile(filePath, { skipCovers: true });
            dirMetadatas.push({ path: filePath, metadata });
          } catch (err) {
            console.error(`Error pre-parsing file ${filePath}:`, err);
          }
        }

        if (dirMetadatas.length === 0) continue;

        // 2. Identify albums in this directory
        const folderName = path.basename(dirPath).replace(/_/g, ' ').trim().normalize('NFC');
        const albumsInDir = new Map<string, typeof dirMetadatas>();
        for (const item of dirMetadatas) {
          let albumName = item.metadata.common.album?.trim().normalize('NFC');
          
          // Fallback to folder name if tag is missing or looks like generic placeholder
          if (!albumName || albumName.toLowerCase() === 'unknown' || albumName.toLowerCase() === 'unknown album') {
            albumName = folderName;
          }

          if (!albumsInDir.has(albumName)) albumsInDir.set(albumName, []);
          albumsInDir.get(albumName)!.push(item);
        }

        for (let [albumName, items] of albumsInDir) {
          // Detect if this is a compilation: different artists but same album, and no consistent albumartist
          const artists = new Set(items.map(i => i.metadata.common.artist).filter(Boolean));
          const albumArtists = new Set(items.map(i => i.metadata.common.albumartist).filter(Boolean));
          const hasCompilationFlag = items.some(i => (i.metadata.common as any).compilation === true);
          
          let effectiveAlbumArtist = "VARIOUS ARTISTS";
          
          if (albumArtists.size === 1) {
            effectiveAlbumArtist = Array.from(albumArtists)[0]!.trim().normalize('NFC');
          } else if (hasCompilationFlag || artists.size > 1) {
            effectiveAlbumArtist = "VARIOUS ARTISTS";
          } else if (artists.size === 1) {
            effectiveAlbumArtist = Array.from(artists)[0]!.trim().normalize('NFC');
          } 

          // Fallback to directory structure if:
          // 1. Tags are missing/Unknown
          // 2. Or if we only have one artist but no album artist and it doesn't match the folder structure
          const firstItem = items[0].metadata.common;
          const albumTagIsMissing = !firstItem.album || firstItem.album.toLowerCase().includes('unknown');
          
          if (albumTagIsMissing || (effectiveAlbumArtist === "VARIOUS ARTISTS" && !hasCompilationFlag)) {
            const artistFolderName = path.basename(path.dirname(dirPath));
            if (artistFolderName && artistFolderName !== '.' && artistFolderName !== '..' && artistFolderName.toLowerCase() !== 'musique') {
              effectiveAlbumArtist = artistFolderName.replace(/_/g, ' ').trim().normalize('NFC');
            }
          }

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

          const cacheKey = `${artistId}-${albumName}`;
          let albumInfo = albumCache.get(cacheKey);

          if (!albumInfo) {
            const firstItemMetadata = items[0].metadata;
            const albumMeta = {
               format: firstItemMetadata.format.container || 'Unknown',
               bitrate: firstItemMetadata.format.bitrate ? Math.round(firstItemMetadata.format.bitrate / 1000) : null,
               sampleRate: firstItemMetadata.format.sampleRate,
               genre: firstItemMetadata.common.genre && firstItemMetadata.common.genre.length > 0 ? firstItemMetadata.common.genre[0] : null,
               duration: 0, // Will sum up later if needed or just use tracks
               fileCount: items.length,
               hasCover: false
            };

            // Intelligence : Recherche de l'album avec tolérance sur la ponctuation (ex: "The Game!" vs "The Game")
            const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
            const targetSlug = slug(albumName);
            
            const existingAlbums = db.prepare('SELECT id, name FROM albums WHERE artist_id = ?').all(artistId) as { id: number, name: string }[];
            let match = existingAlbums.find(a => a.name === albumName); // Exact match
            
            if (!match) {
              match = existingAlbums.find(a => slug(a.name) === targetSlug);
              if (match) {
                console.log(`[Library] Fuzzy match: "${albumName}" mapped to existing album "${match.name}"`);
                // On utilise le nom existant en base pour déclencher le ON CONFLICT
                albumName = match.name;
              }
            }

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
              albumName, 
              effectiveAlbumArtist,
              firstItemMetadata.common.date || firstItemMetadata.common.year || null, 
              firstItemMetadata.format.container || 'Unknown', 
              dirPath,
              firstItemMetadata.common.barcode || null,
              firstItemMetadata.common.label && firstItemMetadata.common.label.length > 0 ? firstItemMetadata.common.label[0] : null,
              JSON.stringify(albumMeta)
            );

            const albumRecord = db.prepare('SELECT id FROM albums WHERE artist_id = ? AND name = ?').get(artistId, albumName) as any;
            if (albumRecord) {
              albumInfo = { id: albumRecord.id, coverHandled: false };
              albumCache.set(cacheKey, albumInfo);
            }
          }

          if (albumInfo) {
            foundAlbumIds.add(albumInfo.id);
            const albumId = albumInfo.id;
            
            // Handle cover for this album if not already done
            if (!albumInfo.coverHandled) {
              const coverPath = path.join(dataDir, `album_${albumId}.jpg`);
              if (!fs.existsSync(coverPath)) {
                // Parse the first file again with covers
                const fullMeta = await mm.parseFile(items[0].path);
                if (fullMeta.common.picture && fullMeta.common.picture.length > 0) {
                   fs.writeFileSync(coverPath, fullMeta.common.picture[0].data);
                } else {
                   // Search for local cover file
                   try {
                     const localFiles = fs.readdirSync(dirPath);
                     const coverRegex = /^(cover|folder|front)\.(png|jpe?g)$/i;
                     const localCover = localFiles.find(f => coverRegex.test(f));
                     if (localCover) {
                       fs.copyFileSync(path.join(dirPath, localCover), coverPath);
                     }
                   } catch (e) {}
                }
              }
              albumInfo.coverHandled = true;
            }

            // Process each track
            for (const item of items) {
              const { metadata, path: filePath } = item;
              const { title, artist, track, disk, bpm, isrc } = metadata.common;

              let trackTitle = title ? title.trim().normalize('NFC') : null;
              let trackNumber = track.no || 0;

              const fileName = path.basename(filePath, path.extname(filePath));
              // Match "01-Title", "01_Title", "01 Title", "01.Title" or just "01"
              const fileMatch = fileName.match(/^([0-9]+)(?:[\s-_.]+|$)(.*)/);

              // Extract track number from filename if missing or 0
              if (trackNumber === 0 && fileMatch) {
                trackNumber = parseInt(fileMatch[1]);
              }

              // Extract track title from filename if missing or looks like "junk" tags
              const titleLooksLikeJunk = trackTitle && (
                trackTitle.toLowerCase().includes('(full album)') || 
                trackTitle.toLowerCase() === 'unknown'
              );

              if (!trackTitle || titleLooksLikeJunk) {
                if (fileMatch && fileMatch[2] && fileMatch[2].trim()) {
                  trackTitle = fileMatch[2].replace(/_/g, ' ').trim().normalize('NFC');
                } else if (fileMatch) {
                  // If filename is just "01", at least we have the number, title can be "Piste 01" or fileName
                  trackTitle = fileName; 
                } else {
                  trackTitle = fileName.replace(/_/g, ' ').trim().normalize('NFC');
                }
              }

              // Essayer de trouver une piste existante par son chemin DIRECT (très efficace pour éviter les doublons lors des renommages)
              const existingTrack = db.prepare('SELECT id, title, number FROM tracks WHERE album_id = ? AND path = ?').get(albumId, filePath) as { id: number, title: string, number: number } | undefined;

              if (existingTrack) {
                // Mise à jour de la piste existante
                db.prepare(`
                  UPDATE tracks SET 
                    title = ?, artist = ?, number = ?, track_total = ?, disc = ?, disc_total = ?, 
                    duration = ?, bpm = ?, isrc = ?, quality = ?, bitrate = ?
                  WHERE id = ?
                `).run(
                  trackTitle,
                  artist ? artist.trim().normalize('NFC') : null,
                  trackNumber,
                  track.of || null,
                  disk.no || 1,
                  disk.of || null,
                  metadata.format.duration || 0,
                  bpm || null,
                  isrc && isrc.length > 0 ? isrc[0] : null,
                  metadata.format.container || 'Unknown',
                  metadata.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : null,
                  existingTrack.id
                );
              } else {
                // Nouvelle piste ou changement d'identifiant (title/number/disc)
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
                  artist ? artist.trim().normalize('NFC') : null,
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
              }
              
              foundTrackPaths.add(filePath);
              processedCount++;
              
              if (processedCount % 50 === 0) {
                console.log(`[Library] Processed ${processedCount}/${totalCount} files...`);
              }

              if (!targetPath && (processedCount % 10 === 0 || processedCount === totalCount)) {
                db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('scan_progress', JSON.stringify({ processed: processedCount, total: totalCount }));
              }
            }
          }
        }
      }
      console.log(`[Library] Scan completed. Processed ${processedCount} tracks.`);

      // 7. Cleanup
      if (!targetPath) {
        console.log('Cleaning up missing albums and tracks...');
        const downloadedAlbums = db.prepare("SELECT id FROM albums WHERE status = 'downloaded'").all() as { id: number }[];
        for (const album of downloadedAlbums) {
          if (!foundAlbumIds.has(album.id)) {
            db.prepare("UPDATE albums SET status = 'missing', path = NULL WHERE id = ?").run(album.id);
            db.prepare('DELETE FROM tracks WHERE album_id = ?').run(album.id);
          }
        }
        
        const allTracks = db.prepare('SELECT id, path FROM tracks').all() as { id: number, path: string }[];
        const seenPaths = new Set<string>();
        for (const track of allTracks) {
          if (!track.path || !foundTrackPaths.has(track.path) || seenPaths.has(track.path)) {
            db.prepare('DELETE FROM tracks WHERE id = ?').run(track.id);
          } else {
            seenPaths.add(track.path);
          }
        }
      } else {
        // En cas de scan partiel, on ne nettoie que les fichiers disparus DANS ce dossier
        const tracksInDir = db.prepare("SELECT id, path FROM tracks WHERE path LIKE ?").all(targetPath + '%') as { id: number, path: string }[];
        const seenPaths = new Set<string>();
        for (const track of tracksInDir) {
          if (!track.path || !foundTrackPaths.has(track.path) || seenPaths.has(track.path)) {
            db.prepare('DELETE FROM tracks WHERE id = ?').run(track.id);
          } else {
            seenPaths.add(track.path);
          }
        }
        
        // Et les albums qui étaient dans ce dossier mais n'y sont plus (ou ont été renommés/regroupés)
        const albumsInDir = db.prepare("SELECT id FROM albums WHERE path LIKE ? AND status = 'downloaded'").all(targetPath + '%') as { id: number }[];
        for (const album of albumsInDir) {
          if (!foundAlbumIds.has(album.id)) {
            db.prepare("UPDATE albums SET status = 'missing', path = NULL WHERE id = ?").run(album.id);
            db.prepare('DELETE FROM tracks WHERE album_id = ?').run(album.id);
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
