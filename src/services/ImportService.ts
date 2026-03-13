import fs from 'fs';
import path from 'path';
import db from '@/lib/db';
import { SabnzbdService } from './sabnzbd';
import { LibraryService } from './library';
import * as mm from 'music-metadata';

export class ImportService {
  private static isProcessing = false;
  private static lastScanTime = 0;
  private static SCAN_INTERVAL = 10000; // 10 secondes pour plus de réactivité

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

    // Throttle : ne pas scanner plus d'une fois par minute
    const now = Date.now();
    if (now - this.lastScanTime < this.SCAN_INTERVAL) {
      return;
    }
    
    const { libraryPath, readOnly } = this.getSettings();

    if (!libraryPath || readOnly) {
      return;
    }

    const downloadDir = path.join(libraryPath, '_A_TRIER');
    if (!fs.existsSync(downloadDir)) {
      return;
    }

    this.isProcessing = true;
    this.lastScanTime = now;

    try {
      const history = await SabnzbdService.getHistory();
      
      for (const slot of history) {
        const isMusic = slot.category?.toLowerCase() === 'music';
        const isCompleted = slot.status === 'Completed';
        const isFailed = slot.status === 'Failed';
        
        if (isMusic && (isCompleted || isFailed)) {
          // Vérifier d'abord si on l'a déjà importé ou marqué en échec pour éviter le spam de log
          const alreadyProcessed = db.prepare("SELECT id FROM activity WHERE type = 'download' AND (status = 'completed' OR status = 'failed') AND details LIKE ?")
            .get(`%"nzo_id":"${slot.nzo_id}"%`);
          
          if (!alreadyProcessed) {
            if (isCompleted) {
              console.log(`[Import] New completed slot found: ${slot.name} (ID: ${slot.nzo_id})`);
              await this.importSabnzbdSlot(slot, downloadDir, libraryPath);
            } else if (isFailed) {
              console.log(`[Import] Failed slot found: ${slot.name} (ID: ${slot.nzo_id})`);
              // On enregistre l'échec dans l'activité pour que le ToastContext le notifie
              db.prepare("INSERT INTO activity (type, status, title, message, details) VALUES ('download', 'failed', ?, ?, ?)")
                .run(slot.name, `Échec SABnzbd: ${slot.fail_message || 'Inconnu'}`, JSON.stringify({ nzo_id: slot.nzo_id }));
            }
          }
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
      // On ne log que si le dossier downloadDir lui-même existe encore
      if (fs.existsSync(downloadDir)) {
        console.log(`[Import] Folder NOT found for "${folderName}" in ${downloadDir}`);
      }
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
    let albumArtist = '';

    try {
      const metadata = await mm.parseFile(fullAudioPath);
      artist = metadata.common.artist || '';
      album = metadata.common.album || '';
      albumArtist = metadata.common.albumartist || '';
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
    const effectiveArtist = (albumArtist || artist).toUpperCase();
    const cleanArtist = effectiveArtist.replace(/[\?*:"<>|\\\/]+/g, '_').trim();
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
    const artistRecord = db.prepare('SELECT id FROM artists WHERE name = ?').get(cleanArtist) as { id: number } | undefined;
    const artistId = artistRecord?.id;

    const activity = db.prepare("SELECT id FROM activity WHERE type = 'download' AND details LIKE ?").get(`%"nzo_id":"${slot.nzo_id}"%`) as any;
    
    if (activity) {
      db.prepare("UPDATE activity SET status = 'completed', message = ?, artist_id = ?, details = ? WHERE id = ?")
        .run(`Importé avec succès dans ${cleanArtist}/${cleanAlbum}`, artistId || null, JSON.stringify({ ...JSON.parse(activity.details || '{}'), nzo_id: slot.nzo_id }), activity.id);
    } else {
      db.prepare("INSERT INTO activity (type, status, title, message, artist_id, details) VALUES ('move', 'completed', ?, ?, ?, ?)")
        .run(album, `Importé depuis SABnzbd vers ${cleanArtist}/${cleanAlbum}`, artistId || null, JSON.stringify({ nzo_id: slot.nzo_id }));
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
