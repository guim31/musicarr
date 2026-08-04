import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as mm from 'music-metadata';
import Blowfish from 'blowfish-node';
import db from '@/lib/db';
import { runFfmpeg, metadataArgs } from '@/lib/ffmpeg';
import { DeezerProvider } from './metadata/providers/DeezerProvider';
import { LibraryService } from './library';

export class DeemixService {
  private static deezer = new DeezerProvider();
  private static sessionCache: any = null;


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
    
    const session = {
      sid: res.headers['set-cookie']?.find(c => c.startsWith('sid='))?.split(';')[0].split('=')[1] || '',
      api_token: res.data.results.checkForm,
      license_token: res.data.results.USER.OPTIONS.license_token
    };
    this.sessionCache = session;
    return session;
  }

  static async searchAlbumWithQuality(query: string) {
    try {
      const session = await this.getSession();
      const res = await axios.post('https://www.deezer.com/ajax/gw-light.php', 
        { query, start: 0, nb: 20, type: 'album' },
        { 
          params: { method: 'deezer.pageSearch', api_version: '1.0', api_token: session.api_token },
          headers: { Cookie: `arl=${this.getArl()}; sid=${session.sid}` }
        }
      );

      if (!res.data?.results?.ALBUM?.data) return [];

      return res.data.results.ALBUM.data.map((album: any) => {
        const formats = album.EXPLICIT_ALBUM_CONTENT?.POSSIBLE_TRACK_FORMATS || [];
        const qualities = [];
        // Deezer formats: 1=MP3_128, 3=MP3_320, 9=FLAC
        if (formats.includes(9)) qualities.push('FLAC');
        if (formats.includes(3)) qualities.push('320');
        if (formats.includes(1)) qualities.push('128');

        return {
          name: album.ALB_TITLE,
          deezerId: album.ALB_ID,
          releaseDate: album.ALB_RELEASE_DATE,
          artistName: album.ART_NAME,
          image: `https://e-cdns-images.dzcdn.net/images/cover/${album.ALB_PICTURE}/1000x1000-000000-80-0-0.jpg`,
          qualities
        };
      });
    } catch (e) {
      console.error('Erreur searchAlbumWithQuality:', e);
      return [];
    }
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

    const artistName = tracks[0].artistName.toUpperCase();
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

    // Récupérer la date existante (depuis DB) car Deezer a souvent des dates de réédition/remaster
    let fallbackDate = '';
    let dbAlbumId = albumId;
    
    if (!dbAlbumId) {
      // Tenter de retrouver l'album par son deezerId dans le JSON metadata
      const row = db.prepare("SELECT id, release_date FROM albums WHERE metadata LIKE ?").get(`%"deezerId":"${deezerAlbumId}"%`) as any;
      if (row) {
        dbAlbumId = row.id;
        if (row.release_date) fallbackDate = row.release_date;
      }
    } else {
      const existing = db.prepare('SELECT release_date FROM albums WHERE id = ?').get(dbAlbumId) as { release_date: string } | undefined;
      if (existing?.release_date) {
        fallbackDate = existing.release_date;
      }
    }

    // Lancer le téléchargement en arrière-plan
    this.runDownloadInBackground(deezerAlbumId, tracks, albumName, albumDir, activityId, dbAlbumId, fallbackDate);

    return { success: true, activityId };
  }

  private static async runDownloadInBackground(deezerAlbumId: string, tracks: any[], albumName: string, albumDir: string, activityId: number | bigint, albumId?: number, fallbackDate?: string) {
    try {
      // 1. Download Album Cover
      const albumData = await (this.deezer as any).fetchDeezer(`album/${deezerAlbumId}`);
      
      const musicPath = this.getMusicPath();
      const stats = musicPath ? fs.statSync(musicPath) : { uid: 0, gid: 0 };
      const ownership = { uid: stats.uid, gid: stats.gid };

      if (albumData?.cover_xl || albumData?.cover_big || albumData?.cover_medium) {
        const coverUrl = albumData.cover_xl || albumData.cover_big || albumData.cover_medium;
        try {
          const coverRes = await axios.get(coverUrl, { 
            responseType: 'arraybuffer',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
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
          await this.finalizeTrack(downloadedPath, track, albumData, ownership, fallbackDate);
        }

        completed++;
        
        db.prepare("UPDATE activity SET details = ? WHERE id = ?")
          .run(JSON.stringify({ deezerId: deezerAlbumId, current: completed, total: tracks.length }), activityId);
      }

      // Récupérer les IDs pour notification
      let artistId = null;
      let dbAlbumId = albumId;
      try {
        if (dbAlbumId) {
          const row = db.prepare('SELECT artist_id FROM albums WHERE id = ?').get(dbAlbumId) as any;
          if (row) artistId = row.artist_id;
        } else {
          const row = db.prepare('SELECT id, artist_id FROM albums WHERE path = ?').get(albumDir) as any;
          if (row) {
             dbAlbumId = row.id;
             artistId = row.artist_id;
          }
        }
      } catch (e) {}

      db.prepare("UPDATE activity SET status = 'completed', message = ?, artist_id = ?, album_id = ? WHERE id = ?")
        .run(`Album ${albumName} téléchargé avec succès (${tracks.length} pistes)`, artistId, dbAlbumId || null, activityId);
      
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
      
      await LibraryService.scan(albumDir).catch(e => console.error('Erreur scan post-download:', e));
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
    // Sanitization plus stricte pour éviter les problèmes shell et filesystem
    const cleanTitle = trackInfo.name.replace(/[\s\?*:"<>|\\\/]+/g, '_');
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
        // Fallback automatique si FLAC non dispo
        if (quality === 'FLAC') {
           console.log(`FLAC non disponible pour ${trackId}, tentative en MP3_320...`);
           try {
            const mp3Res = await axios.post('https://media.deezer.com/v1/get_url', {
              license_token: session.license_token,
              media: [{
                type: "FULL",
                id: actualTrackId,
                formats: [{ format: 'MP3_320', cipher: "BF_CBC_STRIPE" }]
              }],
              track_tokens: [trackToken]
            }, { headers, timeout: 10000 });
            
            const mp3MediaData = mp3Res.data?.data?.[0];
            if (mp3MediaData?.media?.[0]?.sources?.[0]?.url) {
              const mp3Path = filePath.replace(/\.flac$/i, '.mp3');
              return this.processDownloadStream(mp3MediaData.media[0].sources[0].url, mp3Path, trackInfo, actualTrackId, headers);
            }
          } catch (err) {
            console.error('Échec du fallback MP3_320:', err);
          }
        }
        throw new Error(`Erreur Media API: ${mediaData.errors[0].message} (Deezer ID: ${trackId})`);
      }

      if (!mediaData.media || !mediaData.media[0] || !mediaData.media[0].sources || !mediaData.media[0].sources[0]) {
        // Fallback également ici pour le tableau vide
        if (quality === 'FLAC') {
          console.log(`Média vide pour ${trackId} en FLAC, tentative en MP3_320...`);
          try {
            const mp3Res = await axios.post('https://media.deezer.com/v1/get_url', {
              license_token: session.license_token,
              media: [{
                type: "FULL",
                id: actualTrackId,
                formats: [{ format: 'MP3_320', cipher: "BF_CBC_STRIPE" }]
              }],
              track_tokens: [trackToken]
            }, { headers, timeout: 10000 });
            
            const mp3MediaData = mp3Res.data?.data?.[0];
            if (mp3MediaData?.media?.[0]?.sources?.[0]?.url) {
              const mp3Path = filePath.replace(/\.flac$/i, '.mp3');
              return this.processDownloadStream(mp3MediaData.media[0].sources[0].url, mp3Path, trackInfo, actualTrackId, headers);
            }
          } catch (err) {
            console.error('Échec du fallback MP3_320:', err);
          }
        }
        throw new Error(`Piste non disponible en streaming (Deezer ID: ${trackId}). Cela peut être dû à des restrictions géographiques ou à un ARL invalide.`);
      }

      const streamUrl = mediaData.media[0].sources[0].url;
      return this.processDownloadStream(streamUrl, filePath, trackInfo, actualTrackId, headers);
    } catch (error: any) {
      console.error(`Erreur téléchargement piste ${trackId}:`, error);
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        const errors = error.response.data?.errors;
        if (errors && errors[0]?.code === 1002) {
          throw new Error("L'ARL Deezer configuré n'a pas les droits suffisants pour télécharger (compte Premium/HiFi requis)");
        }
        throw new Error("Accès refusé par Deezer (403). Veuillez vérifier ou renouveler votre ARL");
      }
      throw error;
    }
  }

  private static async processDownloadStream(streamUrl: string, filePath: string, trackInfo: any, actualTrackId: string, headers: any): Promise<string> {
    // Fonction de calcul de clé Blowfish pour Deezer
    const getDecryptionKey = (id: string) => {
      const secret = 'g4el58wc0zvf9na1';
      const idMd5 = crypto.createHash('md5').update(id.toString(), 'ascii').digest('hex');
      const bfKey = Buffer.alloc(16);
      for (let i = 0; i < 16; i++) {
        bfKey[i] = idMd5.charCodeAt(i) ^ idMd5.charCodeAt(i + 16) ^ secret.charCodeAt(i);
      }
      return bfKey;
    };

    const bfKey = getDecryptionKey(actualTrackId);
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

    const CHUNK_SIZE = 2048;

    return new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(filePath);
      let buffer = Buffer.alloc(0);
      let chunkIndex = 0;

      response.data.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);

        // Traitement des blocs de 2048 bytes
        while (buffer.length >= CHUNK_SIZE) {
          const processChunk = buffer.subarray(0, CHUNK_SIZE);
          buffer = buffer.subarray(CHUNK_SIZE);

          if (chunkIndex % 3 === 0 && processChunk.length === CHUNK_SIZE) {
            bf.setIv(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]));
            const decrypted = (bf as any)._decodeCBC(processChunk);
            writer.write(Buffer.from(decrypted));
          } else {
            writer.write(processChunk);
          }
          chunkIndex++;
        }
      });

      response.data.on('end', () => {
        if (buffer.length > 0) writer.write(buffer);
        writer.end();
      });

      writer.on('finish', () => {
        try { fs.chmodSync(filePath, 0o666); } catch (e) {}
        resolve(filePath);
      });

      writer.on('error', (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
    });
  }
  private static async finalizeTrack(filePath: string, trackInfo: any, albumData: any, ownership: { uid: number, gid: number }, fallbackDate?: string) {
    const ext = path.extname(filePath);
    const tempPath = `${filePath}.tmp_final${ext}`;
    
    const title = trackInfo.name;
    const artist = (trackInfo.artistName || "").toUpperCase();
    const album = albumData.title;
    const albumArtist = (albumData.artist?.name || artist).toUpperCase();
    // Priorité à la date de la DB (car potentiellement issue de MusicBrainz/Discogs lors du sync)
    const dateStr = fallbackDate || (albumData && albumData.release_date) || '';
    const yearOnly = dateStr ? dateStr.split('-')[0] : '';
    const trackNum = trackInfo.number;
    const discNum = trackInfo.disc || 1;

    // FFmpeg : Injecter les tags et assurer un conteneur propre
    // L'ordre est CRUCIAL : entrées d'abord (-i), puis métadonnées, puis sortie
    const args = ['-y', '-i', filePath];

    // Deuxième entrée (cover) si dispo
    const coverPath = path.join(path.dirname(filePath), 'folder.jpg');
    const hasCover = fs.existsSync(coverPath);
    if (hasCover) {
      args.push('-i', coverPath);
    }

    // Paramètres de mapping et codec
    if (hasCover) {
      args.push('-map', '0:a', '-map', '1:0', '-disposition:v:0', 'attached_pic');
    } else {
      args.push('-map', '0:a');
    }
    args.push('-c:a', 'copy');

    // Tags (doivent être placés après les inputs)
    args.push(...metadataArgs({
      title,
      artist,
      album_artist: albumArtist,
      albumartist: albumArtist, // Pour compatibilité max
      album,
      track: trackNum,
      disc: discNum,
      date: dateStr || undefined,
      year: yearOnly || undefined,
    }));

    if (ext.toLowerCase() === '.mp3') {
      args.push('-id3v2_version', '3');
    }

    args.push(tempPath);

    try {
      await runFfmpeg(args);
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

  static async getAlbumOrganizationPlan(albumId: string) {
    const album = db.prepare(`
      SELECT a.id, a.path, a.name as albumName, a.album_artist, ar.name as artistName 
      FROM albums a 
      JOIN artists ar ON a.artist_id = ar.id 
      WHERE a.id = ?
    `).get(albumId) as { id: number, path: string, albumName: string, artistName: string, album_artist?: string } | undefined;

    if (!album || !album.path || !fs.existsSync(album.path)) {
      throw new Error("Album non trouvé");
    }

    const musicPath = this.getMusicPath();
    if (!musicPath) throw new Error("Chemin de la bibliothèque non configuré");
    
    const normalize = (s: string) => s.split(/[\s_]+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('_');
    const changes: { type: 'file' | 'folder' | 'artist', from: string, to: string }[] = [];

    // 1. Files
    const files = fs.readdirSync(album.path);
    for (const file of files) {
      const fullPath = path.join(album.path, file);
      if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isFile()) {
        const ext = path.extname(file);
        const name = path.basename(file, ext);
        let targetName = normalize(name);
        const match = name.match(/^(\d+)\s*[-_]\s*(.*)$/);
        if (match) targetName = `${match[1].padStart(2, '0')}-${normalize(match[2])}`;
        
        if (file !== `${targetName}${ext}`) {
          changes.push({ type: 'file', from: file, to: `${targetName}${ext}` });
        }
      }
    }

    // 2. Album Folder
    const currentAlbumDir = path.basename(album.path);
    const targetAlbumDir = normalize(currentAlbumDir);
    if (currentAlbumDir !== targetAlbumDir) {
        changes.push({ type: 'folder', from: currentAlbumDir, to: targetAlbumDir });
    }

    // 3. Artist Folder
    const currentArtistDir = path.basename(path.dirname(album.path));
    const targetArtistName = (album.artistName || album.album_artist || "UNKNOWN").toUpperCase();
    const targetArtistFolder = normalize(targetArtistName);
    
    if (currentArtistDir !== targetArtistFolder) {
        changes.push({ type: 'artist', from: currentArtistDir, to: targetArtistFolder });
    }

    return changes;
  }

  static async renameAlbumContents(albumId: string) {
    const album = db.prepare(`
      SELECT a.id, a.path, a.name as albumName, a.album_artist, ar.name as artistName 
      FROM albums a 
      JOIN artists ar ON a.artist_id = ar.id 
      WHERE a.id = ?
    `).get(albumId) as { id: number, path: string, albumName: string, artistName: string, album_artist?: string } | undefined;

    if (!album || !album.path || !fs.existsSync(album.path)) {
      throw new Error("Album non trouvé ou chemin invalide");
    }

    const musicPath = this.getMusicPath();
    if (!musicPath) throw new Error("Chemin de la bibliothèque non configuré");

    const normalize = (s: string) => s.split(/[\s_]+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('_');

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

    // 3. Re-ancrer l'album sous le bon dossier artiste si celui-ci a changé
    const currentArtistDir = path.dirname(finalAlbumPath);
    const targetArtistName = (album.artistName || album.album_artist || "UNKNOWN").toUpperCase();
    const cleanArtistFolder = normalize(targetArtistName);
    const targetArtistDir = path.join(musicPath, cleanArtistFolder);

    if (currentArtistDir !== targetArtistDir) {
      console.log(`[Reorganize] Moving album from ${currentArtistDir} to ${targetArtistDir}`);
      if (!fs.existsSync(targetArtistDir)) {
        fs.mkdirSync(targetArtistDir, { recursive: true });
        try {
          const stats = fs.statSync(musicPath);
          fs.chmodSync(targetArtistDir, 0o777);
          if (stats.uid !== 0) fs.chownSync(targetArtistDir, stats.uid, stats.gid);
        } catch(e) {}
      }
      
      const newAlbumPath = path.join(targetArtistDir, path.basename(finalAlbumPath));
      if (finalAlbumPath !== newAlbumPath) {
        fs.renameSync(finalAlbumPath, newAlbumPath);
        finalAlbumPath = newAlbumPath;
        db.prepare("UPDATE albums SET path = ? WHERE id = ?").run(newAlbumPath, albumId);
        
        // Nettoyer l'ancien dossier artiste s'il est vide
        try {
          if (fs.readdirSync(currentArtistDir).length === 0) {
            fs.rmdirSync(currentArtistDir);
          }
        } catch (e) {}
      }
    }

    // 4. Mettre à jour tous les chemins des pistes en base de données
    const tracks = db.prepare('SELECT id, path FROM tracks WHERE album_id = ?').all(albumId) as { id: number, path: string }[];
    const albumDirFiles = fs.readdirSync(finalAlbumPath);
    
    for (const track of tracks) {
      if (track.path) {
        const currentFileName = path.basename(track.path);
        // On essaie de retrouver le fichier (il a pu être renommé à l'étape 1)
        // La stratégie de renommage à l'étape 1 est déterministe, on peut la reproduire
        // mais le plus simple est de scanner le dossier final.
        const extension = path.extname(track.path);
        const nameWithoutExt = path.basename(track.path, extension);
        
        let targetFileName = normalize(nameWithoutExt);
        const trackMatch = nameWithoutExt.match(/^(\d+)\s*[-_]\s*(.*)$/);
        if (trackMatch) {
          const num = trackMatch[1].padStart(2, '0');
          const title = normalize(trackMatch[2]);
          targetFileName = `${num}-${title}`;
        }
        targetFileName += extension;

        const newTrackPath = path.join(finalAlbumPath, targetFileName);
        if (fs.existsSync(newTrackPath)) {
          db.prepare('UPDATE tracks SET path = ? WHERE id = ?').run(newTrackPath, track.id);
        }
      }
    }

    // 4. Lancer un scan partiel pour mettre à jour la base de données
    await LibraryService.scan(finalAlbumPath);
    
    return true;
  }
}
