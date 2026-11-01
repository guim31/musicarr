import fs from 'fs';
import path from 'path';
import db from '@/lib/db';
import { isInsideLibrary } from '@/lib/paths';
import { safePathSegment } from '@/lib/pathSegment';
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

    // Ne pas scanner si une sync d'artiste est en cours (pour éviter les verrous DB)
    const activeSync = db.prepare("SELECT id FROM activity WHERE type = 'sync' AND status = 'processing'").get();
    if (activeSync) return;
    
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

    const fullAudioPath = audioFile;
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
    // Les tags viennent d'un fichier téléchargé : « .. » ou un nom vide ne
    // doivent ni sortir de la bibliothèque ni déposer l'album à la racine de
    // l'artiste.
    const cleanArtist = safePathSegment(effectiveArtist.replace(/[\?*:"<>|\\\/]+/g, '_').trim());
    const cleanAlbum = safePathSegment(album.replace(/[\?*:"<>|\\\/]+/g, '_').trim());
    
    const artistDir = path.join(libraryPath, cleanArtist);
    const destDir = path.join(artistDir, cleanAlbum);
    if (!isInsideLibrary(destDir)) {
      console.error(`[Import] Destination refusée, hors de la bibliothèque : ${destDir}`);
      return;
    }

    console.log(`[Import] Destination: ${destDir}`);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // 4. Move files
    //
    // Chaque échec est compté : la source était supprimée sans condition à
    // l'étape suivante, si bien qu'un seul déplacement raté (droits, dossier
    // imbriqué sur deux niveaux, disque plein) faisait perdre le fichier.
    const topLevelFiles = fs.readdirSync(localPath);
    let failedMoves = 0;
    for (const file of topLevelFiles) {
      failedMoves += this.moveInto(path.join(localPath, file), path.join(destDir, file));
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

    // 6. Cleanup — seulement si tout a été déplacé. Sinon le reste demeure
    // dans _A_TRIER, et l'activité passe en échec pour ne pas être rejouée
    // en boucle.
    if (failedMoves === 0) {
      try {
        fs.rmSync(localPath, { recursive: true, force: true });
      } catch(e) {}
    } else {
      console.error(`[Import] ${failedMoves} élément(s) non déplacé(s) : ${localPath} est conservé`);
    }

    // 7. Update Database
    const artistRecord = db.prepare('SELECT id FROM artists WHERE name = ?').get(cleanArtist) as { id: number } | undefined;
    const artistId = artistRecord?.id;

    const activity = db.prepare("SELECT id FROM activity WHERE type = 'download' AND details LIKE ?").get(`%"nzo_id":"${slot.nzo_id}"%`) as any;
    const status = failedMoves === 0 ? 'completed' : 'failed';
    const message = failedMoves === 0
      ? `Importé avec succès dans ${cleanArtist}/${cleanAlbum}`
      : `Import partiel dans ${cleanArtist}/${cleanAlbum} : ${failedMoves} élément(s) laissé(s) dans _A_TRIER`;
    
    if (activity) {
      db.prepare("UPDATE activity SET status = ?, message = ?, artist_id = ?, details = ? WHERE id = ?")
        .run(status, message, artistId || null, JSON.stringify({ ...JSON.parse(activity.details || '{}'), nzo_id: slot.nzo_id }), activity.id);
    } else {
      db.prepare("INSERT INTO activity (type, status, title, message, artist_id, details) VALUES ('move', ?, ?, ?, ?, ?)")
        .run(status, album, failedMoves === 0 ? `Importé depuis SABnzbd vers ${cleanArtist}/${cleanAlbum}` : message, artistId || null, JSON.stringify({ nzo_id: slot.nzo_id }));
    }

    // 8. Trigger scan
    await LibraryService.scan(destDir);
  }

  /**
   * Déplace un fichier ou une arborescence, en fusionnant les dossiers déjà
   * présents à destination. Renvoie le nombre d'éléments qui n'ont pas pu
   * l'être.
   */
  private static moveInto(src: string, dest: string): number {
    try {
      const stat = fs.lstatSync(src);
      if (!stat.isDirectory()) {
        fs.renameSync(src, dest);
        return 0;
      }

      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      let failures = 0;
      for (const entry of fs.readdirSync(src)) {
        failures += this.moveInto(path.join(src, entry), path.join(dest, entry));
      }
      return failures;
    } catch (e) {
      console.error(`[Import] Failed to move ${src} to ${dest}:`, e);
      return 1;
    }
  }

  private static getAllFiles(dirPath: string, arrayOfFiles: string[] = []) {
    const files = fs.readdirSync(dirPath);
    files.forEach((file) => {
      const fullPath = path.join(dirPath, file);
      if (fs.statSync(fullPath).isDirectory()) {
        arrayOfFiles = this.getAllFiles(fullPath, arrayOfFiles);
      } else {
        // Chemin complet : avec le seul nom, un album rangé en sous-dossiers
        // (CD1/, CD2/) n'était jamais lu, faute de trouver le fichier.
        arrayOfFiles.push(fullPath);
      }
    });
    return arrayOfFiles;
  }

  private static applyOwnership(targetPath: string, uid: number, gid: number) {
    try {
      // lstat : un lien symbolique contenu dans un téléchargement ne doit pas
      // faire modifier les droits de sa cible (par exemple hors du partage).
      const stat = fs.lstatSync(targetPath);
      if (stat.isSymbolicLink()) return;
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
