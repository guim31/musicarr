import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import db from '@/lib/db';

const execAsync = promisify(exec);

export interface TrackTagUpdate {
  trackId: number;
  title?: string;
  artist?: string;
  album?: string;
  number?: number;
  disc?: number;
  year?: string;
  genre?: string;
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
    const metadataFlags: string[] = [];
    if (update.title) metadataFlags.push(`-metadata title="${update.title.replace(/"/g, '\\"')}"`);
    if (update.artist) metadataFlags.push(`-metadata artist="${update.artist.replace(/"/g, '\\"')}"`);
    if (update.album) metadataFlags.push(`-metadata album="${update.album.replace(/"/g, '\\"')}"`);
    if (update.number) metadataFlags.push(`-metadata track="${update.number}"`);
    if (update.disc) metadataFlags.push(`-metadata disc="${update.disc}"`);
    if (update.year) {
      metadataFlags.push(`-metadata date="${update.year}"`);
      metadataFlags.push(`-metadata year="${update.year}"`);
    }
    if (update.genre) metadataFlags.push(`-metadata genre="${update.genre.replace(/"/g, '\\"')}"`);

    if (metadataFlags.length === 0) return;

    // Use -map_metadata 0 to keep existing metadata not specified
    // -id3v2_version 3 is important for MP3 compatibility (Navidrome/Plex)
    let command = `ffmpeg -y -i "${filePath}" ${metadataFlags.join(' ')} `;
    if (ext === '.mp3') command += '-id3v2_version 3 ';
    command += `-c copy "${tempPath}"`;
    
    try {
      await execAsync(command);
      
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
          db.prepare('UPDATE tracks SET number = ? WHERE id = ?').run(update.number, update.trackId);
        }
        if (update.disc !== undefined) {
          db.prepare('UPDATE tracks SET disc = ? WHERE id = ?').run(update.disc, update.trackId);
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
        
        db.prepare(`
          UPDATE albums SET 
            name = ?, 
            release_date = ?, 
            metadata = ?
          WHERE id = ?
        `).run(
          allSameAlbum ? firstUpdate.album : album.name,
          allSameYear ? firstUpdate.year : album.release_date,
          JSON.stringify(metadata),
          albumId
        );

        if (allSameArtist && firstUpdate.artist) {
          const newArtistName = firstUpdate.artist.toUpperCase();
          // Vérifier si l'artiste existe déjà sous ce nouveau nom
          const existingArtist = db.prepare('SELECT id FROM artists WHERE name = ?').get(newArtistName) as { id: number } | undefined;
          
          if (existingArtist && existingArtist.id !== album.artist_id) {
            // L'album change de "propriétaire" (artiste existant)
            db.prepare('UPDATE albums SET artist_id = ? WHERE id = ?').run(existingArtist.id, albumId);
          } else if (!existingArtist) {
            // On renomme l'artiste actuel (attention, cela affecte TOUS ses autres albums)
            db.prepare('UPDATE artists SET name = ? WHERE id = ?').run(newArtistName, album.artist_id);
          }
        }
      }
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
      
      // FFmpeg command to embed cover
      // -map 0 -map 1:0 : take all streams from audio, first stream from image
      // -disposition:v:0 attached_pic : mark image as attached picture
      let cmd = `ffmpeg -y -i "${track.path}" -i "${coverPath}" -map 0 -map 1:0 -c copy -disposition:v:0 attached_pic`;
      
      // Specfic flags for MP3 id3v2 version
      if (ext.toLowerCase() === '.mp3') {
        cmd += ' -id3v2_version 3 -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (front)"';
      }
      
      cmd += ` "${tempPath}"`;
      
      try {
        await execAsync(cmd);
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
