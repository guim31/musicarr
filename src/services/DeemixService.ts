import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as mm from 'music-metadata';
import db from '@/lib/db';
import { DeezerProvider } from './metadata/providers/DeezerProvider';
import { LibraryService } from './library';

const execAsync = promisify(exec);

export class DeemixService {
  private static deezer = new DeezerProvider();

  private static getArl() {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('deezer_arl') as { value: string } | undefined;
    return setting?.value;
  }

  private static getMusicPath() {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('library_path') as { value: string } | undefined;
    return setting?.value;
  }

  private static getPreferredQuality() {
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('deezer_quality') as { value: string } | undefined;
    return setting?.value || 'MP3_320';
  }

  private static async getSession() {
    const arl = this.getArl();
    if (!arl) throw new Error('ARL non configuré');

    const res = await axios.get('https://www.deezer.com/ajax/gw-light.php', {
      params: {
        method: 'deezer.getUserData',
        api_version: '1.0',
        api_token: ''
      },
      headers: {
        Cookie: `arl=${arl}`
      }
    });

    if (!res.data || !res.data.results) throw new Error('Échec du handshake Deezer');
    
    return {
      sid: res.headers['set-cookie']?.find(c => c.startsWith('sid='))?.split(';')[0].split('=')[1] || '',
      api_token: res.data.results.checkForm,
      license_token: res.data.results.USER.OPTIONS.license_token
    };
  }

  /**
   * Mock de déchiffrement Blowfish pour Deezer.
   * Note: Dans une version réelle, on utiliserait une clé basée sur le trackId.
   */
  private static decryptBuffer(buffer: Buffer, trackId: string): Buffer {
    // Le déchiffrement réel Deezer est complexe (Blowfish CBC avec clé spécifique).
    // Pour cet exercice, nous supposons que nous recevons le flux via un proxy ou que nous avons les libs nécessaires.
    // Dans Musicarr, on va implémenter la logique de téléchargement "normale".
    return buffer;
  }

  private static normalizeFolderName(s: string) {
    return s.replace(/\s+/g, '_');
  }

  private static findExistingPath(parent: string, name: string): string {
    const normalizedName = this.normalizeFolderName(name);
    if (!fs.existsSync(parent)) return path.join(parent, normalizedName);
    
    const items = fs.readdirSync(parent);
    // Normalisation pour la recherche : minuscule et suppression des caractères non-alphanumériques
    const searchNormalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const searchTarget = searchNormalize(name);
    
    for (const item of items) {
      if (searchNormalize(item) === searchTarget) {
        return path.join(parent, item);
      }
    }
    
    return path.join(parent, normalizedName);
  }

  static async downloadAlbum(deezerAlbumId: string, albumId?: number) {
    const arl = this.getArl();
    const musicPath = this.getMusicPath();
    if (!arl) throw new Error('ARL Deezer non configuré');
    if (!musicPath) throw new Error('Chemin de la bibliothèque non configuré');

    const tracks = await this.deezer.getAlbumTracks(deezerAlbumId);
    if (tracks.length === 0) throw new Error('Aucune piste trouvée pour cet album');

    const artistName = tracks[0].artistName;
    const albumName = (await (this.deezer as any).fetchDeezer(`album/${deezerAlbumId}`)).title;

    // Résolution intelligente des dossiers pour éviter les doublons (casse, underscores/espaces)
    const artistDir = this.findExistingPath(musicPath, artistName);
    const albumDir = this.findExistingPath(artistDir, albumName);

    if (!fs.existsSync(albumDir)) {
      fs.mkdirSync(albumDir, { recursive: true });
      // Forcer les permissions et le propriétaire pour éviter les problèmes d'accès root sur NAS
      try {
        const stats = fs.statSync(musicPath);
        // Tenter de répliquer le propriétaire du dossier parent (souvent nobody/users sur NAS)
        try { fs.chownSync(artistDir, stats.uid, stats.gid); } catch(e) {}
        try { fs.chownSync(albumDir, stats.uid, stats.gid); } catch(e) {}
        
        fs.chmodSync(artistDir, 0o777);
        fs.chmodSync(albumDir, 0o777);
      } catch (e) {
        console.error('Erreur chmod/chown:', e);
      }
    }

    const activityId = db.prepare(`
      INSERT INTO activity (type, status, title, message, details, album_id)
      VALUES ('download', 'processing', ?, ?, ?, ?)
    `).run(
      albumName, 
      `Téléchargement de l'album ${albumName} depuis Deezer`, 
      JSON.stringify({ deezerId: deezerAlbumId, current: 0, total: tracks.length }),
      albumId || null
    ).lastInsertRowid;

    // Sauvegarder temporairement (backup) si c'est une mise à niveau
    if (albumId && fs.existsSync(albumDir)) {
      try {
        const files = fs.readdirSync(albumDir);
        for (const file of files) {
          if (file.match(/\.(mp3|flac|m4a|wav)$/i)) {
            const oldPath = path.join(albumDir, file);
            fs.renameSync(oldPath, oldPath + '.upgrade_backup');
          }
        }
        console.log(`Fichiers originaux mis en backup (.upgrade_backup) pour mise à niveau dans : ${albumDir}`);
      } catch (e) {
        console.error('Erreur lors du backup pour mise à niveau:', e);
      }
    }

    // Lancer le téléchargement en arrière-plan
    this.runDownloadInBackground(deezerAlbumId, tracks, albumName, albumDir, activityId);

    return { success: true, activityId };
  }

  private static async runDownloadInBackground(deezerAlbumId: string, tracks: any[], albumName: string, albumDir: string, activityId: number | bigint) {
    try {
      // 1. Download Album Cover
      const albumData = await (this.deezer as any).fetchDeezer(`album/${deezerAlbumId}`);
      
      const musicPath = this.getMusicPath();
      const stats = musicPath ? fs.statSync(musicPath) : { uid: 0, gid: 0 };
      const ownership = { uid: stats.uid, gid: stats.gid };

      if (albumData?.cover_xl || albumData?.cover_big || albumData?.cover_medium) {
        const coverUrl = albumData.cover_xl || albumData.cover_big || albumData.cover_medium;
        try {
          const coverRes = await axios.get(coverUrl, { responseType: 'arraybuffer' });
          const coverPath = path.join(albumDir, 'folder.jpg');
          fs.writeFileSync(coverPath, Buffer.from(coverRes.data));
          
          // Appliquer permissions et proprio à la cover
          try {
            fs.chmodSync(coverPath, 0o666);
            fs.chownSync(coverPath, ownership.uid, ownership.gid);
          } catch(e) {}
          
          console.log(`Cover downloaded for album: ${albumName}`);
        } catch (e) {
          console.error('Failed to download cover:', e);
        }
      }

      const session = await this.getSession();
      let completed = 0;
      for (const track of tracks) {
        let retries = 3;
        let success = false;
        let downloadedPath = '';
        while (retries > 0 && !success) {
          try {
            downloadedPath = await this.downloadTrack(track.deezerId!, albumDir, track, session);
            success = true;
          } catch (e: any) {
            retries--;
            console.error(`Tentative échouée pour ${track.name} (${retries} restantes) : ${e.message}`);
            if (retries > 0) await new Promise(r => setTimeout(r, 2000));
            else throw e;
          }
        }

        // Finaliser le fichier : injection de tags et remuxing avec FFmpeg pour compatibilité Navidrome
        if (success && downloadedPath) {
          await this.finalizeTrack(downloadedPath, track, albumData, ownership);
        }

        completed++;
        
        db.prepare("UPDATE activity SET details = ? WHERE id = ?")
          .run(JSON.stringify({ deezerId: deezerAlbumId, current: completed, total: tracks.length }), activityId);
      }

      db.prepare("UPDATE activity SET status = 'completed', message = ? WHERE id = ?")
        .run(`Album ${albumName} téléchargé avec succès (${tracks.length} pistes)`, activityId);
      
      // Succès : Nettoyer les backups
      if (fs.existsSync(albumDir)) {
        try {
          const files = fs.readdirSync(albumDir);
          for (const file of files) {
            if (file.endsWith('.upgrade_backup')) {
              fs.unlinkSync(path.join(albumDir, file));
            }
          }
        } catch (e) { console.error('Erreur lors du nettoyage des backups:', e); }
      }
      
      await LibraryService.scan().catch(e => console.error('Erreur scan post-download:', e));
    } catch (error: any) {
      // Échec : Restaurer les backups
      if (fs.existsSync(albumDir)) {
        try {
          const files = fs.readdirSync(albumDir);
          for (const file of files) {
            if (file.endsWith('.upgrade_backup')) {
              const backupPath = path.join(albumDir, file);
              const originalPath = backupPath.replace('.upgrade_backup', '');
              // Si un nouveau fichier a été créé mais que le download a échoué, on le supprime pour remettre l'original
              if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
              fs.renameSync(backupPath, originalPath);
            }
          }
          console.log(`Restauration des fichiers originaux terminée suite à l'échec pour l'album : ${albumName}`);
        } catch (re) { console.error('Erreur lors de la restauration des backups:', re); }
      }

      db.prepare("UPDATE activity SET status = 'failed', message = ? WHERE id = ?")
        .run(`Erreur: ${error.message}`, activityId);
    }
  }

  private static async downloadTrack(trackId: string, destDir: string, trackInfo: any, session: any): Promise<string> {
    const quality = this.getPreferredQuality();
    const extension = quality === 'FLAC' ? 'flac' : 'mp3';
    
    // Format attendu : NN-Titre_Avec_Underscores.ext
    const cleanTitle = trackInfo.name.replace(/\s+/g, '_');
    const fileName = `${trackInfo.number.toString().padStart(2, '0')}-${cleanTitle}.${extension}`;
    const filePath = path.join(destDir, fileName);

    console.log(`Downloading track ${trackId} to ${filePath} (Quality: ${quality})`);
    
    const headers = { 
      Cookie: `arl=${this.getArl()}; sid=${session.sid}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    
    try {
      // 1. Obtenir le track_token
      const trackDataRes = await axios.post('https://www.deezer.com/ajax/gw-light.php', 
        { SNG_ID: trackId }, 
        {
          params: {
            method: 'deezer.pageTrack',
            api_version: '1.0',
            api_token: session.api_token
          },
          headers,
          timeout: 10000 // 10s timeout pour les requêtes metadata
        }
      );

      if (!trackDataRes.data || !trackDataRes.data.results || !trackDataRes.data.results.DATA) {
        throw new Error(`Réponse API Deezer invalide: ${JSON.stringify(trackDataRes.data?.error || 'Structure DATA manquante')}`);
      }

      const trackData = trackDataRes.data.results.DATA;
      // Utiliser le fallback s'il n'y a pas de droits pour la piste demandée
      const actualTrack = (trackData.FALLBACK && trackData.FALLBACK.TRACK_TOKEN) ? trackData.FALLBACK : trackData;
      const trackToken = actualTrack.TRACK_TOKEN;
      const actualTrackId = actualTrack.SNG_ID;

      if (!trackToken) throw new Error('Impossible de récupérer le track_token (champ vide)');

      // 2. Obtenir l'URL du média
      // Les formats Deezer : 1=MP3_128, 3=MP3_320, 9=FLAC
      const formatMap: Record<string, number> = { 'MP3_128': 1, 'MP3_320': 3, 'FLAC': 9 };
      const formatId = formatMap[quality] || 3;

      const mediaRes = await axios.post('https://media.deezer.com/v1/get_url', {
        license_token: session.license_token,
        media: [{
          type: "FULL",
          id: actualTrackId,
          formats: [{ format: quality === 'FLAC' ? 'FLAC' : 'MP3_320', cipher: "BF_CBC_STRIPE" }]
        }],
        track_tokens: [trackToken]
      }, { headers, timeout: 10000 });

      if (!mediaRes.data || !mediaRes.data.data || !mediaRes.data.data[0]) {
        throw new Error('Réponse vide de la Media API Deezer');
      }

      const mediaData = mediaRes.data.data[0];

      if (mediaData.errors && mediaData.errors.length > 0) {
        throw new Error(`Erreur Media API: ${mediaData.errors[0].message}`);
      }

      if (!mediaData.media || !mediaData.media[0] || !mediaData.media[0].sources || !mediaData.media[0].sources[0]) {
        throw new Error(`Structure Media API inattendue: ${JSON.stringify(mediaData)}`);
      }

      const streamUrl = mediaData.media[0].sources[0].url;
      if (!streamUrl) throw new Error('URL de stream non trouvée dans la réponse Media API');

      // Fonction de calcul de clé Blowfish pour Deezer
      const getDecryptionKey = (id: string) => {
        const crypto = require('crypto');
        const secret = 'g4el58wc0zvf9na1';
        const idMd5 = crypto.createHash('md5').update(id.toString(), 'ascii').digest('hex');
        const bfKey = Buffer.alloc(16);
        for (let i = 0; i < 16; i++) {
          bfKey[i] = idMd5.charCodeAt(i) ^ idMd5.charCodeAt(i + 16) ^ secret.charCodeAt(i);
        }
        return bfKey;
      };

      const bfKey = getDecryptionKey(actualTrackId);
      const Blowfish = require('blowfish-node');
      const bf = new Blowfish(bfKey, Blowfish.MODE.CBC, Blowfish.PADDING.NULL);
      bf.setIv(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]));

      // 3. Télécharger le flux chiffré
      const response = await axios({
        method: 'GET',
        url: streamUrl,
        responseType: 'stream',
        headers,
        timeout: 30000 // 30s timeout pour le début du flux
      });

      const totalLengthRaw = response.headers['content-length'];
      const totalLength = totalLengthRaw ? parseInt(totalLengthRaw, 10) : 0;
      let downloadedLength = 0;
      let activityIdToUpdate = 0;

      // Retrouver l'ID d'activité si l'albumName est connu
      // On le passera différemment dans un vrai refactoring, mais ici un lookup rapide
      try {
        const row = db.prepare("SELECT id FROM activity WHERE status = 'processing' AND title LIKE ? ORDER BY timestamp DESC LIMIT 1").get(`Téléchargement de l'album ${trackInfo.albumName || '%'}%`) as { id: number };
        if (row) activityIdToUpdate = row.id;
      } catch (e) { /* ignore */ }

      let lastReportedProgress = 0;
      const CHUNK_SIZE = 2048;

      return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(filePath);
        let buffer = Buffer.alloc(0);
        let chunkIndex = 0;

        response.data.on('data', (chunk: Buffer) => {
          buffer = Buffer.concat([buffer, chunk]);
          downloadedLength += chunk.length;

          // Mettre à jour la progression du titre courant (si on a un total)
          if (totalLength > 0 && activityIdToUpdate > 0) {
            const currentProgress = Math.floor((downloadedLength / totalLength) * 100);
            if (currentProgress - lastReportedProgress >= 5 || currentProgress === 100) {
                lastReportedProgress = currentProgress;
                // Lecture des détails actuels pour ne pas écraser current/total
                try {
                  const currentActivity = db.prepare("SELECT details FROM activity WHERE id = ?").get(activityIdToUpdate) as any;
                  if (currentActivity?.details) {
                    const detailsObj = JSON.parse(currentActivity.details);
                    // On combine mode Piste (Deemix) et Pourcentage (Sabnzbd) dans le même objet
                    detailsObj.percentage = currentProgress;
                    db.prepare("UPDATE activity SET details = ? WHERE id = ?").run(JSON.stringify(detailsObj), activityIdToUpdate);
                  }
                } catch(e) {}
            }
          }

          // Traitement des blocs de 2048 bytes
          while (buffer.length >= CHUNK_SIZE) {
            let processChunk = buffer.subarray(0, CHUNK_SIZE);
            buffer = buffer.subarray(CHUNK_SIZE);

            if (chunkIndex % 3 === 0 && processChunk.length === CHUNK_SIZE) {
              bf.setIv(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]));
              // Use internal _decodeCBC to avoid arbitrary padding stripping by blowfish-node
              const decrypted = (bf as any)._decodeCBC(processChunk);
              writer.write(Buffer.from(decrypted));
            } else {
              writer.write(processChunk);
            }
            chunkIndex++;
          }
        });

        response.data.on('end', () => {
          // Écrire le reste du buffer s'il y a lieu
          if (buffer.length > 0) {
            writer.write(buffer);
          }
          writer.end();
        });

        writer.on('finish', () => {
          try {
            fs.chmodSync(filePath, 0o666);
          } catch (e) {
            console.warn(`Impossible de changer les permissions du fichier ${filePath}:`, e);
          }
          resolve(filePath);
        });

        writer.on('error', (err) => {
          fs.unlink(filePath, () => {});
          reject(err);
        });
      });
      
    } catch (error) {
      console.error(`Erreur téléchargement piste ${trackId}:`, error);
      throw error;
    }
  }

  private static async finalizeTrack(filePath: string, trackInfo: any, albumData: any, ownership: { uid: number, gid: number }) {
    const ext = path.extname(filePath);
    const tempPath = `${filePath}.tmp_final${ext}`;
    
    const title = trackInfo.name;
    const artist = trackInfo.artistName;
    const album = albumData.title;
    const year = albumData.release_date ? albumData.release_date.split('-')[0] : '';
    const trackNum = trackInfo.number;
    const discNum = trackInfo.disc || 1;

    // FFmpeg : Injecter les tags et assurer un conteneur propre (notamment pour les FLAC streamés)
    let cmd = `ffmpeg -y -i "${filePath}" `;
    
    // Tags basiques
    cmd += `-metadata title="${title.replace(/"/g, '\\"')}" `;
    cmd += `-metadata artist="${artist.replace(/"/g, '\\"')}" `;
    cmd += `-metadata album="${album.replace(/"/g, '\\"')}" `;
    cmd += `-metadata track="${trackNum}" `;
    cmd += `-metadata disc="${discNum}" `;
    if (year) cmd += `-metadata date="${year}" `;
    
    // Injecter la cover si dispo dans le dossier
    const coverPath = path.join(path.dirname(filePath), 'folder.jpg');
    if (fs.existsSync(coverPath)) {
      cmd += `-i "${coverPath}" -map 0 -map 1:0 -c copy -disposition:v:0 attached_pic `;
      if (ext.toLowerCase() === '.mp3') {
        cmd += '-id3v2_version 3 '; // Important pour Navidrome (ID3v2.3)
      }
    } else {
      cmd += '-c copy ';
    }
    
    cmd += `"${tempPath}"`;

    try {
      await execAsync(cmd);
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(filePath);
        fs.renameSync(tempPath, filePath);
        
        // Appliquer permissions (666) et proprio (identique au dossier parent)
        try {
          fs.chmodSync(filePath, 0o666);
          if (ownership.uid !== 0) {
            fs.chownSync(filePath, ownership.uid, ownership.gid);
          }
        } catch (e) {}
      }
    } catch (e) {
      console.error(`Erreur finalisation ffmpeg pour ${filePath}:`, e);
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      // Fallback : au moins tenter les permissions sur l'original
      try {
        fs.chmodSync(filePath, 0o666);
        if (ownership.uid !== 0) fs.chownSync(filePath, ownership.uid, ownership.gid);
      } catch (e2) {}
    }
  }

  static async renameAlbumContents(albumId: string) {
    const album = db.prepare(`
      SELECT a.id, a.path, a.name as albumName, ar.name as artistName 
      FROM albums a 
      JOIN artists ar ON a.artist_id = ar.id 
      WHERE a.id = ?
    `).get(albumId) as { id: number, path: string, albumName: string, artistName: string } | undefined;

    if (!album || !album.path || !fs.existsSync(album.path)) {
      throw new Error("Album non trouvé ou chemin invalide");
    }

    const musicPath = this.getMusicPath();
    if (!musicPath) throw new Error("Chemin de la bibliothèque non configuré");

    const normalize = (s: string) => s.replace(/\s+/g, '_');

    // 1. Renommer les fichiers dans le dossier
    const files = fs.readdirSync(album.path);
    for (const file of files) {
      const oldPath = path.join(album.path, file);
      if (fs.lstatSync(oldPath).isFile()) {
        const extension = path.extname(file);
        const nameWithoutExt = path.basename(file, extension);
        
        // Appliquer le format : NN-Titre_Avec_Underscores.ext
        // Si le fichier commence déjà par un chiffre et un tiret, on garde cette structure
        let newFolderName = normalize(nameWithoutExt);
        const trackMatch = nameWithoutExt.match(/^(\d+)\s*[-_]\s*(.*)$/);
        if (trackMatch) {
          const num = trackMatch[1].padStart(2, '0');
          const title = normalize(trackMatch[2]);
          newFolderName = `${num}-${title}`;
        }
        
        const newPath = path.join(album.path, `${newFolderName}${extension}`);
        if (oldPath !== newPath) {
          fs.renameSync(oldPath, newPath);
        }
      }
    }

    // 2. Renommer le dossier de l'album lui-même
    const currentAlbumDirName = path.basename(album.path);
    const newAlbumDirName = normalize(currentAlbumDirName);
    let finalAlbumPath = album.path;

    if (currentAlbumDirName !== newAlbumDirName) {
      const parentDir = path.dirname(album.path);
      const newAlbumPath = path.join(parentDir, newAlbumDirName);
      fs.renameSync(album.path, newAlbumPath);
      finalAlbumPath = newAlbumPath;
      
      // Mettre à jour le chemin en base de données
      db.prepare("UPDATE albums SET path = ? WHERE id = ?").run(newAlbumPath, albumId);
    }

    // 3. Renommer le dossier de l'artiste si nécessaire (Force UPPERCASE)
    const artistPath = path.dirname(finalAlbumPath);
    const currentArtistDirName = path.basename(artistPath);
    const newArtistDirName = normalize(currentArtistDirName).toUpperCase();

    if (currentArtistDirName !== newArtistDirName && artistPath !== musicPath) {
      const parentDir = path.dirname(artistPath);
      const newArtistPath = path.join(parentDir, newArtistDirName);
      
      if (!fs.existsSync(newArtistPath)) {
        fs.renameSync(artistPath, newArtistPath);
        const updatedAlbumPath = path.join(newArtistPath, path.basename(finalAlbumPath));
        db.prepare("UPDATE albums SET path = ? WHERE id = ?").run(updatedAlbumPath, albumId);
      }
    }

    // 4. Lancer un scan pour mettre à jour la base de données
    await LibraryService.scan();
    
    return true;
  }
}
