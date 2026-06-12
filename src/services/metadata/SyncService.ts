import db from '@/lib/db';
import { MetadataEngine } from './MetadataEngine';
import { CompareUtils } from '@/lib/CompareUtils';
import { RemoteAlbum } from './types';
import { MusicBrainzProvider } from './providers/MusicBrainzProvider';
import { DiscogsProvider } from './providers/DiscogsProvider';
import { DeezerProvider } from './providers/DeezerProvider';

export class SyncService {
  private engine = new MetadataEngine();

  async syncArtist(artistId: number, filterTypes?: string[], deep?: boolean) {
    const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(artistId) as any;
    if (!artist) throw new Error('Artiste non trouvé');

    // Nettoyage des anciennes tâches bloquées pour cet artiste
    db.prepare("UPDATE activity SET status = 'failed', message = 'Annulé par une nouvelle synchronisation' WHERE type = 'sync' AND artist_id = ? AND status = 'processing'")
      .run(artistId);

    // Création de l'activité initiale
    const activityResult = db.prepare(`
      INSERT INTO activity (type, status, title, artist_id, message, details)
      VALUES ('sync', 'processing', ?, ?, ?, ?)
    `).run(artist.name, artistId, `Synchronisation de la discographie de ${artist.name}...`, JSON.stringify({ progress: 0, provider: 'Initialisation' }));
    
    const activityId = activityResult.lastInsertRowid;

    const updateProgress = (provider: string, current: number, total: number) => {
      const percentage = total > 0 ? (current / total) * 100 : 0;
      db.prepare('UPDATE activity SET details = ? WHERE id = ?')
        .run(JSON.stringify({ progress: Math.min(99, percentage), provider, current, total }), activityId);
    };

    let mbid = artist.mbid;
    let discogsId = artist.discogs_id;
    let meta: any = {};
    try { meta = artist.metadata ? JSON.parse(artist.metadata) : {}; } catch {}
    let deezerId = meta.deezerId;

    try {
      const mbProvider = new MusicBrainzProvider();
      const dcProvider = new DiscogsProvider();
      const dzProvider = new DeezerProvider();

      const withTimeout = <T>(promise: Promise<T[]>, providerName: string): Promise<T[] | null> => {
        return Promise.race([
          promise,
          new Promise<T[]>((_, reject) => setTimeout(() => reject(new Error(`Timeout ${providerName}`)), 300000)) // 5 minutes max
        ]).catch(err => {
          console.warn(`[Sync] ${providerName} a échoué ou expiré :`, err.message);
          return null;
        });
      };

      const saveToCache = (provider: string, data: any[]) => {
        db.prepare(`
          INSERT INTO artist_cache (artist_id, provider, data, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(artist_id, provider) DO UPDATE SET 
             data = excluded.data,
             updated_at = CURRENT_TIMESTAMP
        `).run(artistId, provider, JSON.stringify(data));
      };

      // ÉTAPE 1 : DEEZER
      try {
        db.prepare('UPDATE activity SET message = ? WHERE id = ?').run(`Scan Deezer en cours...`, activityId);
        let dzId = deezerId;
        if (!dzId) {
          const search = await dzProvider.searchArtist(artist.name);
          const match = search.find(r => CompareUtils.normalize(r.name) === CompareUtils.normalize(artist.name)) || search[0];
          if (match) dzId = match.deezerId;
        }
        if (dzId) {
          console.log(`[Sync] Deezer ID trouvé : ${dzId}`);
          const albums = await withTimeout(dzProvider.getArtistAlbums(dzId, (c, t) => updateProgress('Deezer', c, t), filterTypes, deep), 'Deezer');
          if (albums !== null) {
            console.log(`[Sync] Deezer scan fini, sauvegarde en cache (${albums.length} items)...`);
            saveToCache('deezer', albums);
          }
        }
      } catch (e) { console.error('Deezer step failed', e); }

      // ÉTAPE 2 : MUSICBRAINZ
      try {
        db.prepare('UPDATE activity SET message = ? WHERE id = ?').run(`Scan MusicBrainz en cours...`, activityId);
        let mbId = mbid;
        if (!mbId) {
          const search = await mbProvider.searchArtist(artist.name);
          const match = search.find(r => CompareUtils.normalize(r.name) === CompareUtils.normalize(artist.name)) || search[0];
          if (match) mbId = match.mbid;
        }
        if (mbId) {
          console.log(`[Sync] MusicBrainz ID trouvé : ${mbId}`);
          const albums = await withTimeout(mbProvider.getArtistAlbums(mbId, (c, t) => updateProgress('MusicBrainz', c, t), filterTypes, deep), 'MusicBrainz');
          if (albums !== null) {
            console.log(`[Sync] MusicBrainz scan fini, sauvegarde en cache (${albums.length} items)...`);
            saveToCache('musicbrainz', albums);
          }
        }
      } catch (e) { console.error('MusicBrainz step failed', e); }

      // ÉTAPE 3 : DISCOGS
      try {
        db.prepare('UPDATE activity SET message = ? WHERE id = ?').run(`Scan Discogs en cours...`, activityId);
        let dcId = discogsId;
        if (!dcId) {
          const search = await dcProvider.searchArtist(artist.name);
          const match = search.find(r => CompareUtils.normalize(r.name) === CompareUtils.normalize(artist.name)) || search[0];
          if (match) dcId = match.discogsId;
        }
        if (dcId) {
          console.log(`[Sync] Discogs ID trouvé : ${dcId}`);
          const albums = await withTimeout(dcProvider.getArtistAlbums(dcId, (c, t) => updateProgress('Discogs', c, t), filterTypes, deep), 'Discogs');
          if (albums !== null) {
            console.log(`[Sync] Discogs scan fini, sauvegarde en cache (${albums.length} items)...`);
            saveToCache('discogs', albums);
            console.log(`[Sync] Discogs cache sauvegardé.`);
          }
        }
      } catch (e) { console.error('Discogs step failed', e); }

      // TERMINÉ
      // TERMINÉ
      console.log(`[Sync] Mise à jour terminée pour ${artist.name}. Passage au statut completed.`);
      db.prepare("UPDATE activity SET status = 'completed', message = ?, details = ? WHERE id = ?")
        .run(
          `Mise à jour terminée pour ${artist.name}.`, 
          JSON.stringify({ progress: 100, provider: 'Terminé', current: 1, total: 1 }),
          activityId
        );

      return 0;
    } catch (error: any) {
      console.error(`[Sync] Erreur fatale :`, error);
      db.prepare("UPDATE activity SET status = 'failed', message = ? WHERE id = ?")
        .run(`Erreur lors de la mise à jour : ${error.message}`, activityId);
      throw error;
    }
  }
}
