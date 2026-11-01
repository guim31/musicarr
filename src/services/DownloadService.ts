import db from '@/lib/db';
import { DeemixService } from './DeemixService';
import { SabnzbdService } from './sabnzbd';

export type DownloadProtocol = 'deemix' | 'usenet' | 'torrent';

export interface StartDownloadInput {
  /** Identifiant d'album Deezer pour Deemix, URL du NZB pour l'Usenet. */
  url: string;
  title?: string;
  protocol?: string;
  albumId?: number;
}

export interface StartDownloadResult {
  success: boolean;
  activityId: string | null;
}

/** Demande de téléchargement irrecevable : message destiné à l'utilisateur (HTTP 400). */
export class InvalidDownloadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDownloadRequestError';
  }
}

/** Levée quand le protocole demandé n'a pas de client configuré. */
export class UnsupportedProtocolError extends InvalidDownloadRequestError {
  constructor(protocol: string) {
    super(
      protocol === 'torrent'
        ? 'Le téléchargement de torrents n’est pas pris en charge : aucun client torrent n’est configuré.'
        : `Protocole non pris en charge : ${protocol}`,
    );
    this.name = 'UnsupportedProtocolError';
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Point d'entrée unique du téléchargement.
 *
 * Deux routes faisaient auparavant le même métier différemment : la recherche
 * globale ne rattachait pas le téléchargement à un album, ne créait pas de
 * ligne d'activité pour l'Usenet, et surtout testait `if (success)` sur un
 * objet — donc toujours vrai. Elle répondait « succès » même quand SABnzbd
 * avait refusé le NZB.
 */
export class DownloadService {
  static async start(input: StartDownloadInput): Promise<StartDownloadResult> {
    const protocol = (input.protocol || '').toLowerCase();
    const title = input.title || 'Téléchargement Musicarr';

    if (protocol === 'deemix') {
      // L'identifiant est interpolé dans des URL de l'API Deezer : « ../ »
      // y désignerait un autre point d'accès.
      if (!/^\d+$/.test(input.url)) {
        throw new InvalidDownloadRequestError('Identifiant d’album Deezer invalide');
      }
      const result = await DeemixService.downloadAlbum(input.url, input.albumId);
      return {
        success: result.success,
        activityId: result.activityId != null ? `local-${result.activityId}` : null,
      };
    }

    if (protocol === 'usenet') {
      if (!isHttpUrl(input.url)) {
        throw new InvalidDownloadRequestError('L’adresse du NZB doit être une URL http(s)');
      }
      const { success, ids } = await SabnzbdService.addNzbFromUrl(input.url, title);
      if (!success) {
        return { success: false, activityId: null };
      }

      const activityId = db
        .prepare(
          `INSERT INTO activity (type, status, title, message, album_id, details)
           VALUES ('download', 'pending', ?, ?, ?, ?)`,
        )
        .run(
          title,
          `Téléchargement NZB lancé : ${title}`,
          input.albumId ?? null,
          JSON.stringify({ nzo_id: ids[0] }),
        ).lastInsertRowid;

      return { success: true, activityId: `local-${activityId}` };
    }

    throw new UnsupportedProtocolError(protocol || 'inconnu');
  }
}
