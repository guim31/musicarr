
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const mm = require('music-metadata');
const { glob } = require('glob');

const db = new Database('data/musicarr.db');

class LibraryService {
  static async scan(targetPath) {
    const musicPathRes = db.prepare('SELECT value FROM settings WHERE key = ?').get('library_path');
    const musicPath = musicPathRes.value;
    const scanDir = targetPath || musicPath;
    
    console.log(`Scanning: ${scanDir}`);
    if (!fs.existsSync(scanDir)) {
        console.error(`Path ${scanDir} does not exist!`);
        return;
    }

    const files = await glob('**/*.{flac,mp3,m4a,wav}', { cwd: scanDir, absolute: true });
    console.log(`Found ${files.length} files in ${scanDir}`);

    const filesByDir = new Map();
    for (const f of files) {
      const dir = path.dirname(f);
      if (!filesByDir.has(dir)) filesByDir.set(dir, []);
      filesByDir.get(dir).push(f);
    }

    const sortedDirs = Array.from(filesByDir.keys());

    for (const dirPath of sortedDirs) {
        const dirFiles = filesByDir.get(dirPath) || [];
        const folderName = path.basename(dirPath).replace(/_/g, ' ').trim().normalize('NFC');
        
        const dirMetadatas = [];
        for (const filePath of dirFiles) {
            const metadata = await mm.parseFile(filePath, { skipCovers: true });
            dirMetadatas.push({ path: filePath, metadata });
        }
        
        const albumsInDir = new Map();
        for (const item of dirMetadatas) {
          let albumName = item.metadata.common.album?.trim().normalize('NFC');
          if (!albumName || albumName.toLowerCase() === 'unknown' || albumName.toLowerCase() === 'unknown album') {
            albumName = folderName;
          }
          if (!albumsInDir.has(albumName)) albumsInDir.set(albumName, []);
          albumsInDir.get(albumName).push(item);
        }

        for (const [albumName, items] of albumsInDir) {
            const artists = new Set(items.map(i => i.metadata.common.artist).filter(Boolean));
            const albumArtists = new Set(items.map(i => i.metadata.common.albumartist).filter(Boolean));
            
            let effectiveAlbumArtist = "VARIOUS ARTISTS";
            if (albumArtists.size === 1) {
              effectiveAlbumArtist = Array.from(albumArtists)[0].trim().normalize('NFC');
            } else if (artists.size === 1) {
              effectiveAlbumArtist = Array.from(artists)[0].trim().normalize('NFC');
            }

            const firstItem = items[0].metadata.common;
            const albumTagIsMissing = !firstItem.album || firstItem.album.toLowerCase().includes('unknown');
            
            if (albumTagIsMissing || (effectiveAlbumArtist === "VARIOUS ARTISTS")) {
              const artistFolderName = path.basename(path.dirname(dirPath));
              if (artistFolderName && artistFolderName !== '.' && artistFolderName !== '..' && artistFolderName.toLowerCase() !== 'musique') {
                effectiveAlbumArtist = artistFolderName.replace(/_/g, ' ').trim().normalize('NFC');
              }
            }

            const artistName = effectiveAlbumArtist.toUpperCase();
            let artistRow = db.prepare('SELECT id FROM artists WHERE name = ?').get(artistName);
            let artistId;
            if (!artistRow) {
                const res = db.prepare('INSERT INTO artists (name) VALUES (?)').run(artistName);
                artistId = res.lastInsertRowid;
            } else {
                artistId = artistRow.id;
            }

            db.prepare(`
              INSERT INTO albums (artist_id, name, album_artist, status, path)
              VALUES (?, ?, ?, 'downloaded', ?)
              ON CONFLICT(artist_id, name) DO UPDATE SET
                path = excluded.path,
                status = 'downloaded'
            `).run(artistId, albumName, effectiveAlbumArtist, dirPath);
            
            const albumRecord = db.prepare('SELECT id FROM albums WHERE artist_id = ? AND name = ?').get(artistId, albumName);
            const albumId = albumRecord.id;
            console.log(`Album DB ID: ${albumId} for ${albumName} by ${artistName}`);

            for (const item of items) {
                const { title, track, disk } = item.metadata.common;
                let trackTitle = title ? title.trim().normalize('NFC') : null;
                let trackNumber = track.no || 0;
                const fileName = path.basename(item.path, path.extname(item.path));
                const fileMatch = fileName.match(/^([0-9]+)[\s-_.]+(.*)/);
                if (trackNumber === 0 && fileMatch) trackNumber = parseInt(fileMatch[1]);
                if (!trackTitle || trackTitle.toLowerCase().includes('full album')) {
                    trackTitle = fileMatch ? fileMatch[2].replace(/_/g, ' ') : fileName.replace(/_/g, ' ');
                }

                db.prepare(`
                    INSERT INTO tracks (album_id, title, number, path, disc)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(album_id, title, number, disc) DO UPDATE SET path = excluded.path
                `).run(albumId, trackTitle, trackNumber, item.path, disk.no || 1);
            }
            
            const count = db.prepare('SELECT count(*) as c FROM tracks WHERE album_id = ?').get(albumId).c;
            console.log(`Tracks in DB for this album: ${count}`);
        }
    }
  }
}

db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('library_path', '/home/guilhem/Musique/');

LibraryService.scan('/home/guilhem/Musique/RACIAL_ABUSE/No_Need').then(() => {
    console.log('Done');
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
