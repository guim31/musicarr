import * as mm from 'music-metadata';
import { glob } from 'glob';
import path from 'path';
import fs from 'fs';
import db from '@/lib/db';

import { CompareUtils } from '@/lib/CompareUtils';

export interface ScanUpdate {
  path: string;
  artist: string;
  album: string;
  progress: number;
}

export class LibraryService {
  private static isScanning = false;

  private static getMusicPath() {
    return db.prepare('SELECT value FROM settings WHERE key = ?').get('library_path') as { value: string } | undefined;
  }

  private static saveAlbumTransaction = db.transaction((
    artistName: string,
    albumName: string,
    effectiveAlbumArtist: string,
    firstItemMetadata: any,
    itemsCount: number,
    dirPath: string,
    tracksToSave: any[]
  ) => {
    // 1. Resolve artistId
    let artistId: number | bigint;
    const upperName = artistName.toUpperCase();
    const exactArtist = db.prepare('SELECT id, name FROM artists WHERE name = ? COLLATE NOCASE').get(artistName) as { id: number } | undefined;
    if (exactArtist) {
      artistId = exactArtist.id;
    } else {
      const allArtists = db.prepare('SELECT id, name FROM artists').all() as { id: number, name: string }[];
      const match = allArtists.find(a => CompareUtils.normalize(a.name) === CompareUtils.normalize(artistName));
      if (match) {
        artistId = match.id;
      } else {
        artistId = db.prepare('INSERT INTO artists (name) VALUES (?)').run(upperName).lastInsertRowid;
      }
    }

    // 2. Resolve or insert album
    const targetSlug = CompareUtils.normalize(albumName);
    const existingAlbums = db.prepare('SELECT id, name FROM albums WHERE artist_id = ?').all(artistId) as { id: number, name: string }[];
    let matchedAlbum = existingAlbums.find(a => a.name === albumName);
    if (!matchedAlbum) {
      matchedAlbum = existingAlbums.find(a => CompareUtils.normalize(a.name) === targetSlug);
      if (matchedAlbum) {
        albumName = matchedAlbum.name;
      }
    }

    const albumMeta = {
      format: firstItemMetadata.container || 'Unknown',
      bitrate: firstItemMetadata.bitrate ? Math.round(firstItemMetadata.bitrate / 1000) : null,
      sampleRate: firstItemMetadata.sampleRate,
      genre: firstItemMetadata.genre,
      duration: 0, 
      fileCount: itemsCount,
      hasCover: false
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
      albumName, 
      effectiveAlbumArtist,
      firstItemMetadata.date || firstItemMetadata.year || null, 
      firstItemMetadata.container || 'Unknown', 
      dirPath,
      firstItemMetadata.barcode || null,
      firstItemMetadata.label || null,
      JSON.stringify(albumMeta)
    );

    const albumRecord = db.prepare('SELECT id FROM albums WHERE artist_id = ? AND name = ?').get(artistId, albumName) as { id: number };
    const albumId = albumRecord.id;

    // 3. Save tracks
    for (const track of tracksToSave) {
      const existingTrack = db.prepare('SELECT id, path FROM tracks WHERE album_id = ? AND path = ?').get(albumId, track.filePath) as { id: number } | undefined;
      if (existingTrack) {
        db.prepare(`
          UPDATE tracks SET 
            title = ?, artist = ?, number = ?, track_total = ?, disc = ?, disc_total = ?, 
            duration = ?, bpm = ?, isrc = ?, quality = ?, bitrate = ?
          WHERE id = ?
        `).run(
          track.title,
          track.artist,
          track.number,
          track.trackTotal,
          track.disc,
          track.discTotal,
          track.duration,
          track.bpm,
          track.isrc,
          track.quality,
          track.bitrate,
          existingTrack.id
        );
      } else {
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
          track.title,
          track.artist,
          track.number,
          track.trackTotal,
          track.disc,
          track.discTotal,
          track.duration,
          track.bpm,
          track.isrc,
          track.quality,
          track.bitrate,
          track.filePath
        );
      }
    }

    return albumId;
  });

  private static cleanupTransaction = db.transaction((
    targetPath: string | undefined,
    foundAlbumIdsArray: number[],
    foundTrackPathsArray: string[]
  ) => {
    const foundAlbumIds = new Set(foundAlbumIdsArray);
    const foundTrackPaths = new Set(foundTrackPathsArray);

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
  });

  static async scan(targetPath?: string) {
    if (this.isScanning) {
      console.log(`[Library] Scan already in progress (in-memory). Skipping scan for: ${targetPath || 'full library'}`);
      return 0;
    }

    const progressRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('scan_progress') as { value: string } | undefined;
    if (progressRow) {
      console.log(`[Library] Scan already in progress (database). Skipping scan for: ${targetPath || 'full library'}`);
      return 0;
    }

    this.isScanning = true;

    try {
      const musicPathRes = this.getMusicPath();
      if (!musicPathRes?.value) throw new Error('Le chemin de la bibliothèque n\'est pas configuré');
      const musicPath = musicPathRes.value;

      console.log(`Scanning library at: ${targetPath || musicPath}`);

      // Indiquer immédiatement que le scan commence (seulement si scan complet)
      if (!targetPath) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('scan_progress', JSON.stringify({ processed: 0, total: -1 }));
      }

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

        for (const [albumName, items] of albumsInDir) {
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

          const artistName = effectiveAlbumArtist.trim();

          const firstItemMetadata = {
            container: items[0].metadata.format.container || 'Unknown',
            bitrate: items[0].metadata.format.bitrate,
            sampleRate: items[0].metadata.format.sampleRate,
            genre: items[0].metadata.common.genre && items[0].metadata.common.genre.length > 0 ? items[0].metadata.common.genre[0] : null,
            date: items[0].metadata.common.date,
            year: items[0].metadata.common.year,
            barcode: items[0].metadata.common.barcode,
            label: items[0].metadata.common.label && items[0].metadata.common.label.length > 0 ? items[0].metadata.common.label[0] : null,
          };

          // Map track data in memory first
          const tracksToSave = items.map(item => {
            const { metadata, path: filePath } = item;
            const { title, artist, track, disk, bpm, isrc } = metadata.common;

            let trackTitle = title ? title.trim().normalize('NFC') : null;
            let trackNumber = track.no || 0;

            const fileName = path.basename(filePath, path.extname(filePath));
            const fileMatch = fileName.match(/^([0-9]+)(?:[\s-_.]+|$)(.*)/);

            if (trackNumber === 0 && fileMatch) {
              trackNumber = parseInt(fileMatch[1]);
            }

            const titleLooksLikeJunk = trackTitle && (
              trackTitle.toLowerCase().includes('(full album)') || 
              trackTitle.toLowerCase() === 'unknown'
            );

            if (!trackTitle || titleLooksLikeJunk) {
              if (fileMatch && fileMatch[2] && fileMatch[2].trim()) {
                trackTitle = fileMatch[2].replace(/_/g, ' ').trim().normalize('NFC');
              } else if (fileMatch) {
                trackTitle = fileName; 
              } else {
                trackTitle = fileName.replace(/_/g, ' ').trim().normalize('NFC');
              }
            }

            return {
              title: trackTitle,
              artist: artist ? artist.trim().normalize('NFC') : null,
              number: trackNumber,
              trackTotal: track.of || null,
              disc: disk.no || 1,
              discTotal: disk.of || null,
              duration: metadata.format.duration || 0,
              bpm: bpm || null,
              isrc: isrc && isrc.length > 0 ? isrc[0] : null,
              quality: metadata.format.container || 'Unknown',
              bitrate: metadata.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : null,
              filePath
            };
          });

          // Run DB writes for artist, album, and tracks in one transaction
          const albumId = this.saveAlbumTransaction(
            artistName,
            albumName,
            effectiveAlbumArtist,
            firstItemMetadata,
            items.length,
            dirPath,
            tracksToSave
          );

          foundAlbumIds.add(albumId);
          tracksToSave.forEach(t => foundTrackPaths.add(t.filePath));

          // 4. Handle cover asynchronously (disk only)
          const coverPath = path.join(dataDir, `album_${albumId}.jpg`);
          if (!fs.existsSync(coverPath)) {
            try {
              // Parse the first file again with covers
              const fullMeta = await mm.parseFile(items[0].path);
              if (fullMeta.common.picture && fullMeta.common.picture.length > 0) {
                 fs.writeFileSync(coverPath, fullMeta.common.picture[0].data);
              } else {
                 // Search for local cover file
                 const localFiles = fs.readdirSync(dirPath);
                 const coverRegex = /^(cover|folder|front)\.(png|jpe?g)$/i;
                 const localCover = localFiles.find(f => coverRegex.test(f));
                 if (localCover) {
                   fs.copyFileSync(path.join(dirPath, localCover), coverPath);
                 }
              }
            } catch (e) {}
          }

          processedCount += items.length;

          if (processedCount % 50 === 0) {
            console.log(`[Library] Processed ${processedCount}/${totalCount} files...`);
          }

          if (!targetPath && (processedCount % 10 === 0 || processedCount === totalCount)) {
            db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('scan_progress', JSON.stringify({ processed: processedCount, total: totalCount }));
          }
        }
      }
      console.log(`[Library] Scan completed. Processed ${processedCount} tracks.`);

      // 7. Cleanup
      this.cleanupTransaction(targetPath, Array.from(foundAlbumIds), Array.from(foundTrackPaths));

      if (!targetPath) {
        db.prepare(`
          INSERT INTO activity (type, status, title, message)
          VALUES ('scan', 'completed', 'Scan Bibliothèque', ?)
        `).run(`Fin de scan complet : ${processedCount} fichiers traités.`);
      }

      return processedCount;
    } finally {
      this.isScanning = false;
      if (!targetPath) {
        db.prepare('DELETE FROM settings WHERE key = ?').run('scan_progress');
      }
    }
  }
}
