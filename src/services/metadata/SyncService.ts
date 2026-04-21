import db from '@/lib/db';
import { MetadataEngine } from './MetadataEngine';
import { CompareUtils } from '@/lib/CompareUtils';

export class SyncService {
  private engine = new MetadataEngine();

  async syncArtist(artistId: number) {
    const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(artistId) as any;
    if (!artist) throw new Error('Artiste non trouvé');

    // Création de l'activité initiale
    const activityResult = db.prepare(`
      INSERT INTO activity (type, status, title, artist_id, message, details)
      VALUES ('sync', 'processing', ?, ?, ?, ?)
    `).run(artist.name, artistId, `Synchronisation de la discographie de ${artist.name}...`, JSON.stringify({ progress: 0, provider: 'Initialisation' }));
    
    const activityId = activityResult.lastInsertRowid;

    const updateProgress = (provider: string, current: number, total: number) => {
      const percentage = total > 0 ? (current / total) * 100 : 0;
      db.prepare('UPDATE activity SET details = ? WHERE id = ?')
        .run(JSON.stringify({ progress: percentage, provider, current, total }), activityId);
    };

    let mbid = artist.mbid;
    let discogsId = artist.discogs_id;
    let meta: any = {};
    try { meta = artist.metadata ? JSON.parse(artist.metadata) : {}; } catch {}
    let deezerId = meta.deezerId;

    try {
      // 1. Search missing IDs if necessary
      if (!mbid || !discogsId || !deezerId) {
        updateProgress('Recherche d\'identifiants', 0, 1);
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
      const remoteAlbums = await this.engine.syncArtistDiscography(mbid, discogsId, deezerId, (provider, current, total) => {
        updateProgress(provider, current, total);
      });

      // 3. Merge with local DB
      let newFound = 0;
      const localAlbums = db.prepare('SELECT id, name, mbid, discogs_id, type, status, metadata FROM albums WHERE artist_id = ?').all(artistId) as any[];

      for (const remote of remoteAlbums) {
        const remoteSlug = CompareUtils.normalize(remote.name);
        const existing = localAlbums.find(a => 
          (remote.mbid && a.mbid === remote.mbid) || 
          (remote.discogsId && a.discogs_id === remote.discogsId) ||
          (CompareUtils.normalize(a.name) === remoteSlug)
        );

        if (existing) {
          let albumMeta: any = {};
          try { albumMeta = existing.metadata ? JSON.parse(existing.metadata) : {}; } catch {}
          if (remote.image && !albumMeta.artworkUrl) albumMeta.artworkUrl = remote.image;
          if (remote.deezerId && !albumMeta.deezerId) albumMeta.deezerId = remote.deezerId;
          
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
              JSON.stringify(albumMeta), 
              existing.id
            );
        } else {
          const albumMeta: any = {};
          if (remote.image) albumMeta.artworkUrl = remote.image;
          if (remote.deezerId) albumMeta.deezerId = remote.deezerId;
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
            JSON.stringify(albumMeta)
          );
          newFound++;
        }
      }

      // Marquer comme terminé
      db.prepare('UPDATE activity SET status = "completed", message = ? WHERE id = ?')
        .run(`Sync terminée pour ${artist.name} : ${newFound} nouveaux albums trouvés.`, activityId);

      return newFound;
    } catch (error: any) {
      db.prepare('UPDATE activity SET status = "failed", message = ? WHERE id = ?')
        .run(`Erreur de sync pour ${artist.name} : ${error.message}`, activityId);
      throw error;
    }
  }
}
