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
      readOnly: readOnly?.value !== 'false' // Par défaut lecture seule si non défini ou true
    };
  }

  /**
   * Scans SABnzbd history and process completed music downloads
   */
  static async processSabnzbdDownloads() {
    if (this.isProcessing) return;
    
    const { libraryPath, readOnly } = this.getSettings();
    if (!libraryPath || readOnly) return;

    const downloadDir = path.join(libraryPath, '_A_TRIER');
    if (!fs.existsSync(downloadDir)) return;

    this.isProcessing = true;
    try {
      const history = await SabnzbdService.getHistory();
      const musicCompleted = history.filter((slot: any) => 
        slot.category === 'music' && slot.status === 'Completed'
      );

      for (const slot of musicCompleted) {
        await this.importSabnzbdSlot(slot, downloadDir, libraryPath);
      }
    } catch (error) {
      console.error('ImportService error:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private static async importSabnzbdSlot(slot: any, downloadDir: string, libraryPath: string) {
    // 1. Locate the folder
    const folderName = slot.name;
    const localPath = path.join(downloadDir, folderName);

    if (!fs.existsSync(localPath)) {
      console.log(`Folder not found in _A_TRIER: ${folderName}`);
      return;
    }

    // 2. Identify Artist/Album by scanning audio files
    const files = this.getAllFiles(localPath);
    const audioFile = files.find(f => f.match(/\.(mp3|flac|m4a|wav)$/i));

    if (!audioFile) {
      console.log(`No audio files found in ${localPath}`);
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
      console.error(`Metadata parsing failed for ${fullAudioPath}`);
    }

    if (!artist || !album) {
       const parts = folderName.split('-');
       if (parts.length >= 2) {
         artist = artist || parts[0].replace(/_/g, ' ');
         album = album || parts[1].replace(/_/g, ' ');
       }
    }

    if (!artist || !album) {
      console.log(`Could not determine artist/album for ${folderName}`);
      return;
    }

    // 3. Prepare destination
    const cleanArtist = artist.toUpperCase().replace(/[\?*:"<>|\\\/]+/g, '_').trim();
    const cleanAlbum = album.replace(/[\?*:"<>|\\\/]+/g, '_').trim();
    
    const artistDir = path.join(libraryPath, cleanArtist);
    const destDir = path.join(artistDir, cleanAlbum);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // 4. Move files (flat move to destDir, preserving 1 level of subdirs like CD1)
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
        console.error(`Failed to move ${src} to ${dest}:`, e);
      }
    }

    // 5. Apply permissions
    try {
      const stats = fs.statSync(libraryPath);
      this.applyOwnership(destDir, stats.uid, stats.gid);
    } catch(e) {}

    // 6. Cleanup empty source folder
    try {
      fs.rmSync(localPath, { recursive: true, force: true });
    } catch(e) {}

    // 7. Update Database / Activity
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
    arrayOfFiles = arrayOfFiles || [];

    files.forEach((file) => {
      if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
        arrayOfFiles = this.getAllFiles(path.join(dirPath, file), arrayOfFiles);
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
