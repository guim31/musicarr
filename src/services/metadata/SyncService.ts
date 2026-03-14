import db from '@/lib/db';
import { MetadataEngine } from './MetadataEngine';
import { CompareUtils } from '@/lib/CompareUtils';

export class SyncService {
  private engine = new MetadataEngine();

  async syncArtist(artistId: number) {
    const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(artistId) as any;
    if (!artist) throw new Error('Artiste non trouvé');

    let mbid = artist.mbid;
    let discogsId = artist.discogs_id;
    let meta: any = {};
    try { meta = artist.metadata ? JSON.parse(artist.metadata) : {}; } catch {}
    let deezerId = meta.deezerId;

    // 1. Search missing IDs if necessary
    if (!mbid || !discogsId || !deezerId) {
      console.log(`Searching IDs for artist: ${artist.name}`);
      const results = await this.engine.searchArtist(artist.name);
      
      const targetSlug = CompareUtils.normalize(artist.name);
      const match = results.find(r => CompareUtils.normalize(r.name) === targetSlug) || results[0];
      
      if (match) {
        mbid = mbid || match.mbid;
        discogsId = discogsId || match.discogsId;
        deezerId = deezerId || match.deezerId;
        
        meta.deezerId = deezerId;
        
        db.prepare('UPDATE artists SET mbid = ?, discogs_id = ?, metadata = ? WHERE id = ?')
          .run(mbid || null, discogsId || null, JSON.stringify(meta), artistId);
      }
    }

    // 2. Fetch discography from all available sources
    console.log(`Syncing discography for: ${artist.name}`);
    const remoteAlbums = await this.engine.syncArtistDiscography(mbid, discogsId, deezerId);

    // 3. Merge with local DB
    let newFound = 0;
    for (const remote of remoteAlbums) {
      // On garde tout maintenant pour permettre le filtrage/tri dans l'UI
      // if (remote.type && remote.type !== 'album' && remote.type !== 'ep') continue;

      const localAlbums = db.prepare('SELECT id, name, mbid, discogs_id, type, status, metadata FROM albums WHERE artist_id = ?').all(artistId) as any[];
      const remoteSlug = CompareUtils.normalize(remote.name);

      const existing = localAlbums.find(a => 
        (remote.mbid && a.mbid === remote.mbid) || 
        (remote.discogsId && a.discogs_id === remote.discogsId) ||
        (CompareUtils.normalize(a.name) === remoteSlug)
      );

      if (existing) {
        let meta: any = {};
        try { meta = existing.metadata ? JSON.parse(existing.metadata) : {}; } catch {}
        if (remote.image && !meta.artworkUrl) meta.artworkUrl = remote.image;
        if (remote.deezerId && !meta.deezerId) meta.deezerId = remote.deezerId;
        
        const typePriority = (t: string | null | undefined) => {
          if (t === 'album') return 10;
          if (t === 'compilation') return 8;
          if (t === 'ep') return 5;
          if (t === 'single') return 1;
          return 0;
        };

        const currentType = existing.type;
        const remoteType = remote.type;
        
        let newType = remoteType || currentType;
        
        // Logique de consolidation : 
        // 1. Si déjà téléchargé et marqué comme album, on garde 'album'
        // 2. Sinon on prend le type avec la plus haute priorité
        if (existing.status === 'downloaded' && currentType === 'album' && typePriority(remoteType) < 10) {
          newType = 'album';
        } else if (typePriority(currentType) > typePriority(remoteType)) {
          newType = currentType;
        }

        db.prepare('UPDATE albums SET mbid = ?, discogs_id = ?, type = ?, metadata = ? WHERE id = ?')
          .run(
            remote.mbid || existing.mbid, 
            remote.discogsId || existing.discogs_id, 
            newType,
            JSON.stringify(meta), 
            existing.id
          );
      } else {
        const meta: any = {};
        if (remote.image) meta.artworkUrl = remote.image;
        if (remote.deezerId) meta.deezerId = remote.deezerId;
        db.prepare(`
          INSERT INTO albums (artist_id, name, mbid, discogs_id, release_date, type, status, metadata)
          VALUES (?, ?, ?, ?, ?, ?, 'missing', ?)
        `).run(
          artistId,
          remote.name,
          remote.mbid || null,
          remote.discogsId || null,
          remote.releaseDate || null,
          remote.type || 'album',
          JSON.stringify(meta)
        );
        newFound++;
      }
    }

    db.prepare(`
      INSERT INTO activity (type, status, title, artist_id, message)
      VALUES ('sync', 'completed', ?, ?, ?)
    `).run(artist.name, artistId, `Sync terminée pour ${artist.name} : ${newFound} nouveaux albums trouvés.`);

    return newFound;
  }
}
