import db from '@/lib/db';
import { MetadataEngine } from './MetadataEngine';

export class SyncService {
  private engine = new MetadataEngine();

  async syncArtist(artistId: number) {
    const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(artistId) as any;
    if (!artist) throw new Error('Artiste non trouvé');

    let mbid = artist.mbid;
    let discogsId = artist.discogs_id;

    // 1. Search missing IDs if necessary
    if (!mbid || !discogsId) {
      console.log(`Searching IDs for artist: ${artist.name}`);
      const results = await this.engine.searchArtist(artist.name);
      const match = results.find(r => r.name.toLowerCase() === artist.name.toLowerCase()) || results[0];
      
      if (match) {
        mbid = mbid || match.mbid;
        discogsId = discogsId || match.discogsId;
        
        db.prepare('UPDATE artists SET mbid = ?, discogs_id = ? WHERE id = ?')
          .run(mbid || null, discogsId || null, artistId);
      }
    }

    // 2. Fetch discography from all available sources
    console.log(`Syncing discography for: ${artist.name}`);
    const remoteAlbums = await this.engine.syncArtistDiscography(mbid, discogsId);

    // 3. Merge with local DB
    let newFound = 0;
    for (const remote of remoteAlbums) {
      if (remote.type && remote.type !== 'album' && remote.type !== 'ep') continue;

      const existing = db.prepare(`
        SELECT id, mbid, discogs_id FROM albums 
        WHERE artist_id = ? AND (
          (mbid IS NOT NULL AND mbid = ?) OR 
          (discogs_id IS NOT NULL AND discogs_id = ?) OR 
          (name = ? COLLATE NOCASE)
        )
      `).get(artistId, remote.mbid, remote.discogsId, remote.name) as any;

      if (existing) {
        db.prepare('UPDATE albums SET mbid = ?, discogs_id = ? WHERE id = ?')
          .run(remote.mbid || existing.mbid, remote.discogsId || existing.discogs_id, existing.id);
      } else {
        db.prepare(`
          INSERT INTO albums (artist_id, name, mbid, discogs_id, release_date, status)
          VALUES (?, ?, ?, ?, ?, 'missing')
        `).run(
          artistId,
          remote.name,
          remote.mbid || null,
          remote.discogsId || null,
          remote.releaseDate || null
        );
        newFound++;
      }
    }

    return newFound;
  }
}
