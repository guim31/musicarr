import fs from 'fs';
import path from 'path';
import axios from 'axios';
import db from '@/lib/db';
import { runFfmpeg, metadataArgs } from '@/lib/ffmpeg';
import { DeemixService } from './DeemixService';

export interface TrackTagUpdate {
  trackId: number;
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  number?: number;
  trackTotal?: number;
  disc?: number;
  discTotal?: number;
  year?: string;
  genre?: string;
  bpm?: number;
  isrc?: string;
  barcode?: string;
  label?: string;
}

export class TagService {
  /**
   * Updates metadata for a single track using ffmpeg
   */
  static async updateTrackTags(update: TrackTagUpdate) {
    const track = db.prepare('SELECT path FROM tracks WHERE id = ?').get(update.trackId) as { path: string } | undefined;
    if (!track || !track.path || !fs.existsSync(track.path)) {
      throw new Error(`Fichier non trouvé pour la piste ${update.trackId}`);
    }

    const filePath = track.path;
    const tempPath = `${filePath}.tmp${path.extname(filePath)}`;
    
    const ext = path.extname(filePath).toLowerCase();

    const metadataFlags = metadataArgs({
      title: update.title,
      artist: update.artist,
      album: update.album,
      album_artist: update.albumArtist,
      track: update.number
        ? (update.trackTotal ? `${update.number}/${update.trackTotal}` : `${update.number}`)
        : undefined,
      disc: update.disc
        ? (update.discTotal ? `${update.disc}/${update.discTotal}` : `${update.disc}`)
        : undefined,
      date: update.year,
      year: update.year,
      genre: update.genre,
      bpm: update.bpm,
      isrc: update.isrc,
      barcode: update.barcode,
      publisher: update.label,
    });

    if (metadataFlags.length === 0) return;

    // -id3v2_version 3 est important pour la compatibilité MP3 (Navidrome/Plex).
    const args = ['-y', '-i', filePath, ...metadataFlags];
    if (ext === '.mp3') args.push('-id3v2_version', '3');
    args.push('-c', 'copy', tempPath);

    try {
      await runFfmpeg(args);
      
      // Verification
      if (fs.existsSync(tempPath)) {
        // Swap files
        fs.unlinkSync(filePath);
        fs.renameSync(tempPath, filePath);
        
        // Fix permissions and ownership
        try {
          const musicPathSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('library_path') as { value: string } | undefined;
          if (musicPathSetting?.value) {
            const stats = fs.statSync(musicPathSetting.value);
            fs.chmodSync(filePath, 0o666);
            if (stats.uid !== 0) fs.chownSync(filePath, stats.uid, stats.gid);
          }
        } catch (e) {}

        // Update DB
        if (update.title) {
          db.prepare('UPDATE tracks SET title = ? WHERE id = ?').run(update.title, update.trackId);
        }
        if (update.number !== undefined) {
          db.prepare('UPDATE tracks SET number = ?, track_total = ? WHERE id = ?').run(update.number, update.trackTotal || null, update.trackId);
        }
        if (update.disc !== undefined) {
          db.prepare('UPDATE tracks SET disc = ?, disc_total = ? WHERE id = ?').run(update.disc, update.discTotal || null, update.trackId);
        }
        if (update.artist) {
          db.prepare('UPDATE tracks SET artist = ? WHERE id = ?').run(update.artist, update.trackId);
        }
        if (update.bpm) {
          db.prepare('UPDATE tracks SET bpm = ? WHERE id = ?').run(update.bpm, update.trackId);
        }
        if (update.isrc) {
          db.prepare('UPDATE tracks SET isrc = ? WHERE id = ?').run(update.isrc, update.trackId);
        }
        
        // If artist or album name changed, it might affect the whole album/artist record.
        // Usually, the library scanner handles this on next run, 
        // but let's at least update the track-specific info if needed.
        
        return true;
      }
      throw new Error("La création du fichier temporaire a échoué");
    } catch (error) {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      console.error(`Erreur lors de la mise à jour des tags pour ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Updates tags for multiple tracks and syncs DB
   */
  static async updateAlbumTags(albumId: number, updates: TrackTagUpdate[]) {
    const results = [];
    
    // 1. Perform file updates
    for (const update of updates) {
      try {
        await this.updateTrackTags(update);
        results.push({ trackId: update.trackId, success: true });
      } catch (err: any) {
        results.push({ trackId: update.trackId, success: false, error: err.message });
      }
    }

    // 2. Intelligence: Si tous les titres d'un album ont été mis à jour avec le même Artiste/Album/Année, 
    // on met à jour l'entrée de l'album et éventuellement de l'artiste dans la DB.
    
    const firstUpdate = updates[0];
    const allSameArtist = updates.every(u => u.artist === firstUpdate.artist && u.artist !== undefined);
    const allSameAlbum = updates.every(u => u.album === firstUpdate.album && u.album !== undefined);
    const allSameYear = updates.every(u => u.year === firstUpdate.year && u.year !== undefined);
    const allSameGenre = updates.every(u => u.genre === firstUpdate.genre && u.genre !== undefined);

    if (allSameAlbum || allSameYear || allSameGenre) {
      const album = db.prepare('SELECT id, artist_id, metadata FROM albums WHERE id = ?').get(albumId) as any;
      if (album) {
        const metadata = album.metadata ? JSON.parse(album.metadata) : {};
        if (allSameGenre) metadata.genre = firstUpdate.genre;
        
        const first = updates[0];
        
        db.prepare(`
          UPDATE albums SET 
            name = ?, 
            album_artist = ?,
            release_date = ?, 
            barcode = ?,
            label = ?,
            metadata = ?
          WHERE id = ?
        `).run(
          allSameAlbum ? first.album : album.name,
          first.albumArtist || null,
          allSameYear ? first.year : album.release_date,
          first.barcode || null,
          first.label || null,
          JSON.stringify(metadata),
          albumId
        );

        // Intelligence : mettre à jour le lien artiste/album si l'artiste a changé
        const targetArtistName = (first.albumArtist || (allSameArtist ? firstUpdate.artist : null))?.toUpperCase();
        if (targetArtistName) {
          const existingArtist = db.prepare('SELECT id FROM artists WHERE name = ?').get(targetArtistName) as { id: number } | undefined;
          
          if (existingArtist) {
            if (existingArtist.id !== album.artist_id) {
              db.prepare('UPDATE albums SET artist_id = ? WHERE id = ?').run(existingArtist.id, albumId);
            }
          } else {
             // Créer le nouvel artiste s'il n'existe pas
             const newArtistId = db.prepare('INSERT INTO artists (name) VALUES (?)').run(targetArtistName).lastInsertRowid;
             db.prepare('UPDATE albums SET artist_id = ? WHERE id = ?').run(newArtistId, albumId);
          }
        } else if (allSameArtist && firstUpdate.artist) {
          // Cas simple : tous les titres ont le même artiste, on peut potentiellement renommer l'artiste
          const newArtistName = firstUpdate.artist.toUpperCase();
          const existingArtist = db.prepare('SELECT id FROM artists WHERE name = ?').get(newArtistName) as { id: number } | undefined;
          
          if (existingArtist && existingArtist.id !== album.artist_id) {
            db.prepare('UPDATE albums SET artist_id = ? WHERE id = ?').run(existingArtist.id, albumId);
          } else if (!existingArtist) {
            // On renomme l'artiste actuel (si c'était son seul album ou s'il n'avait pas de MBID)
            db.prepare('UPDATE artists SET name = ? WHERE id = ?').run(newArtistName, album.artist_id);
          }
        }
      }
    }

    // Déclenchement automatique de la réorganisation physique après mise à jour des tags
    try {
      await DeemixService.renameAlbumContents(albumId.toString());
    } catch (e) {
      console.error("[TagService] Erreur lors de la réorganisation automatique:", e);
    }

    return results;
  }

  /**
   * Updates the cover for an entire album
   * 1. Saves to folder.jpg in the album directory
   * 2. Embeds into every track file
   * 3. Replaces the cached cover in data/covers
   */
  static async updateAlbumCover(albumId: number, coverSource: Buffer | string) {
    const album = db.prepare('SELECT path, id FROM albums WHERE id = ?').get(albumId) as { path: string, id: number } | undefined;
    if (!album || !album.path || !fs.existsSync(album.path)) {
      throw new Error("Dossier de l'album non trouvé");
    }

    let buffer: Buffer;
    if (typeof coverSource === 'string') {
      const res = await axios.get(coverSource, { 
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      buffer = Buffer.from(res.data);
    } else {
      buffer = coverSource;
    }

    const coverPath = path.join(album.path, 'folder.jpg');
    fs.writeFileSync(coverPath, buffer);
    
    // Fix permissions and ownership for cover
    try {
      const musicPathSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('library_path') as { value: string } | undefined;
      if (musicPathSetting?.value) {
        const stats = fs.statSync(musicPathSetting.value);
        fs.chmodSync(coverPath, 0o666);
        if (stats.uid !== 0) fs.chownSync(coverPath, stats.uid, stats.gid);
      }
    } catch (e) {}

    // Update tracks
    const tracks = db.prepare('SELECT id, path FROM tracks WHERE album_id = ?').all(albumId) as { id: number, path: string }[];
    for (const track of tracks) {
      if (!fs.existsSync(track.path)) continue;

      const ext = path.extname(track.path);
      const tempPath = `${track.path}.tmp_cover${ext}`;
      
      // -map 0 -map 1:0 : tous les flux de l'audio + le premier flux de l'image
      // -disposition:v:0 attached_pic : marque l'image comme pochette
      const args = [
        '-y',
        '-i', track.path,
        '-i', coverPath,
        '-map', '0',
        '-map', '1:0',
        '-c', 'copy',
        '-disposition:v:0', 'attached_pic',
      ];

      // Drapeaux spécifiques à la version id3v2 pour les MP3
      if (ext.toLowerCase() === '.mp3') {
        args.push(
          '-id3v2_version', '3',
          '-metadata:s:v', 'title=Album cover',
          '-metadata:s:v', 'comment=Cover (front)',
        );
      }

      args.push(tempPath);

      try {
        await runFfmpeg(args);
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(track.path);
          fs.renameSync(tempPath, track.path);
          
          // Fix permissions and ownership
          try {
            const musicPathSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('library_path') as { value: string } | undefined;
            if (musicPathSetting?.value) {
              const stats = fs.statSync(musicPathSetting.value);
              fs.chmodSync(track.path, 0o666);
              if (stats.uid !== 0) fs.chownSync(track.path, stats.uid, stats.gid);
            }
          } catch (e) {}
        }
      } catch (err) {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        console.error(`Failed to embed cover in ${track.path}:`, err);
      }
    }

    // Refresh cached preview
    const dataDir = path.join(process.cwd(), 'data', 'covers');
    const cachedCoverPath = path.join(dataDir, `album_${albumId}.jpg`);
    fs.writeFileSync(cachedCoverPath, buffer);

    return true;
  }
}
