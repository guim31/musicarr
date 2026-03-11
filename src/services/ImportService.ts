import fs from 'fs';
import path from 'path';
import db from '@/lib/db';
import { SabnzbdService } from './sabnzbd';
import { LibraryService } from './library';
import * as mm from 'music-metadata';

export class ImportService {
  private static isProcessing = false;

  private static getSettings() {
    const musicPath = db.prepare('SELECT value FROM settings WHERE key = ?').get('library_path') as { value: string } | undefined;
    const readOnly = db.prepare('SELECT value FROM settings WHERE key = ?').get('read_only_mode') as { value: string } | undefined;

    return {
      libraryPath: musicPath?.value,
      readOnly: readOnly?.value !== 'false' // Default to read-only if not 'false'
    };
  }

  /**
   * Scans SABnzbd history and process completed music downloads
   */
  static async processSabnzbdDownloads() {
    if (this.isProcessing) return;
    
    const { libraryPath, readOnly } = this.getSettings();
    console.log(`[Import] Scan SABnzbd - Path: ${libraryPath}, ReadOnly: ${readOnly}`);

    if (!libraryPath || readOnly) {
      if (!libraryPath) console.log("[Import] libraryPath non configuré.");
      if (readOnly) console.log("[Import] Mode lecture seule actif, importation ignorée.");
      return;
    }

    const downloadDir = path.join(libraryPath, '_A_TRIER');
    if (!fs.existsSync(downloadDir)) {
      console.log(`[Import] Dossier downloadDir non trouvé : ${downloadDir}`);
      return;
    }

    this.isProcessing = true;
    try {
      const history = await SabnzbdService.getHistory();
      console.log(`[Import] SABnzbd history items: ${history.length}`);
      
      for (const slot of history) {
        const isMusic = slot.category?.toLowerCase() === 'music';
        const isCompleted = slot.status === 'Completed';
        
        if (isMusic && isCompleted) {
          console.log(`[Import] Processing slot: ${slot.name} (ID: ${slot.nzo_id})`);
          await this.importSabnzbdSlot(slot, downloadDir, libraryPath);
        } else if (isMusic) {
          console.log(`[Import] Skipping slot ${slot.name}: status is "${slot.status}" (expected "Completed")`);
        }
      }
    } catch (error) {
      console.error('[Import] Error during processSabnzbdDownloads:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private static async importSabnzbdSlot(slot: any, downloadDir: string, libraryPath: string) {
    const folderName = slot.name;
    const storage = slot.storage; 
    console.log(`[Import] Checking slot: "${folderName}" (Category: ${slot.category}, Status: ${slot.status}, Storage: ${storage})`);
    
    let localPath = path.join(downloadDir, folderName);
    if (!fs.existsSync(localPath) && storage) {
        const storageBase = path.basename(storage);
        if (storageBase !== folderName) {
            const altPath = path.join(downloadDir, storageBase);
            if (fs.existsSync(altPath)) {
                localPath = altPath;
                console.log(`[Import] Using storage base path: ${localPath}`);
            }
        }
    }

    if (!fs.existsSync(localPath)) {
      const folders = fs.readdirSync(downloadDir);
      console.log(`[Import] Folder NOT found for "${folderName}". Content of _A_TRIER: ${folders.join(', ')}`);
      return;
    }

    console.log(`[Import] Processing folder: ${localPath}`);

    // 2. Identify Artist/Album
    const files = this.getAllFiles(localPath);
    const audioFile = files.find(f => f.match(/\.(mp3|flac|m4a|wav)$/i));

    if (!audioFile) {
      console.log(`[Import] No audio files found in ${localPath}`);
      return;
    }

    const fullAudioPath = path.join(localPath, audioFile);
    let artist = '';
    let album = '';

    try {
      const metadata = await mm.parseFile(fullAudioPath);
      artist = metadata.common.artist || '';
      album = metadata.common.album || '';
    } catch (e) {
      console.error(`[Import] Metadata parsing failed for ${fullAudioPath}`);
    }

    if (!artist || !album) {
       const parts = folderName.split('-');
       if (parts.length >= 2) {
         artist = artist || parts[0].replace(/_/g, ' ');
         album = album || parts[1].replace(/_/g, ' ');
       }
    }

    if (!artist || !album) {
      console.log(`[Import] Could not determine artist/album for ${folderName}`);
      return;
    }

    // 3. Prepare destination
    const cleanArtist = artist.toUpperCase().replace(/[\?*:"<>|\\\/]+/g, '_').trim();
    const cleanAlbum = album.replace(/[\?*:"<>|\\\/]+/g, '_').trim();
    
    const artistDir = path.join(libraryPath, cleanArtist);
    const destDir = path.join(artistDir, cleanAlbum);

    console.log(`[Import] Destination: ${destDir}`);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // 4. Move files
    const topLevelFiles = fs.readdirSync(localPath);
    for (const file of topLevelFiles) {
      const src = path.join(localPath, file);
      const dest = path.join(destDir, file);
      
      try {
        if (fs.statSync(src).isDirectory()) {
          if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
          const subFiles = fs.readdirSync(src);
          for (const subFile of subFiles) {
            fs.renameSync(path.join(src, subFile), path.join(dest, subFile));
          }
        } else {
          fs.renameSync(src, dest);
        }
      } catch (e) {
        console.error(`[Import] Failed to move ${src} to ${dest}:`, e);
      }
    }

    // 5. Detect and Copy Cover
    try {
      const dataDir = path.join(process.cwd(), 'data', 'covers');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      
      const albumRecord = db.prepare('SELECT id FROM albums WHERE artist_id = (SELECT id FROM artists WHERE name = ?) AND name = ?')
        .get(cleanArtist, cleanAlbum) as { id: number } | undefined;

      if (albumRecord) {
        const cachedCoverPath = path.join(dataDir, `album_${albumRecord.id}.jpg`);
        const coverRegex = /^(cover|folder|front)\.(png|jpe?g)$/i;
        const localCover = topLevelFiles.find(f => coverRegex.test(f));
        
        if (localCover && !fs.existsSync(cachedCoverPath)) {
          const srcCover = path.join(destDir, localCover);
          fs.copyFileSync(srcCover, cachedCoverPath);
          console.log(`[Import] Cover cached: ${localCover} -> album_${albumRecord.id}.jpg`);
        }
      }
    } catch (e) {
      console.error('[Import] Error handling cover:', e);
    }

    // 6. Apply permissions
    try {
      const stats = fs.statSync(libraryPath);
      this.applyOwnership(destDir, stats.uid, stats.gid);
    } catch(e) {}

    // 6. Cleanup
    try {
      fs.rmSync(localPath, { recursive: true, force: true });
    } catch(e) {}

    // 7. Update Database
    const activity = db.prepare("SELECT id FROM activity WHERE type = 'download' AND details LIKE ?").get(`%"nzo_id":"${slot.nzo_id}"%`) as any;
    
    if (activity) {
      db.prepare("UPDATE activity SET status = 'completed', message = ? WHERE id = ?")
        .run(`Importé avec succès dans ${cleanArtist}/${cleanAlbum}`, activity.id);
    } else {
      db.prepare("INSERT INTO activity (type, status, title, message) VALUES ('move', 'completed', ?, ?)")
        .run(album, `Importé depuis SABnzbd vers ${cleanArtist}/${cleanAlbum}`);
    }

    // 8. Trigger scan
    await LibraryService.scan(destDir);
  }

  private static getAllFiles(dirPath: string, arrayOfFiles: string[] = []) {
    const files = fs.readdirSync(dirPath);
    files.forEach((file) => {
      const fullPath = path.join(dirPath, file);
      if (fs.statSync(fullPath).isDirectory()) {
        arrayOfFiles = this.getAllFiles(fullPath, arrayOfFiles);
      } else {
        arrayOfFiles.push(file);
      }
    });
    return arrayOfFiles;
  }

  private static applyOwnership(targetPath: string, uid: number, gid: number) {
    try {
      const stat = fs.statSync(targetPath);
      if (uid !== 0) fs.chownSync(targetPath, uid, gid);
      fs.chmodSync(targetPath, stat.isDirectory() ? 0o777 : 0o666);

      if (stat.isDirectory()) {
        const files = fs.readdirSync(targetPath);
        for (const file of files) {
          this.applyOwnership(path.join(targetPath, file), uid, gid);
        }
      }
    } catch (e) {}
  }
}
