import axios from 'axios';
import dns from 'node:dns';
import net from 'node:net';
import { isPublicAddress } from './publicAddress';

/** Refus d'une URL ou d'une réponse : message destiné à l'utilisateur. */
export class PublicFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicFetchError';
  }
}

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function assertPublicUrl(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PublicFetchError('URL invalide');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PublicFetchError('Seules les URL http(s) sont acceptées');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  // Une IP littérale ne passe pas par la résolution DNS : on la vérifie ici.
  if (net.isIP(host) && !isPublicAddress(host)) {
    throw new PublicFetchError('Adresse non publique refusée');
  }
}

/**
 * Résolution DNS qui refuse les adresses non publiques.
 *
 * Branchée sur la connexion elle-même : elle s'applique à chaque redirection
 * et ferme la porte au « DNS rebinding », où le nom résout vers une adresse
 * publique au contrôle puis vers 127.0.0.1 à la connexion.
 */
function publicLookup(
  hostname: string,
  _options: unknown,
  callback: (error: Error | null, addresses?: { address: string; family: number }[]) => void,
): void {
  dns.lookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (addresses.length === 0 || addresses.some(entry => !isPublicAddress(entry.address))) {
      return callback(new PublicFetchError(`L'hôte ${hostname} ne résout pas vers une adresse publique`));
    }
    callback(null, addresses);
  });
}

/**
 * Télécharge une image depuis une URL fournie par le client.
 *
 * Le serveur s'exécute sur le réseau local, avec accès au NAS, au routeur et
 * aux autres services : une requête serveur vers une URL arbitraire permettait
 * de les interroger, et l'image écrite dans le dossier de l'album était
 * ensuite relisible par `GET /api/albums/:id/cover`. Seules les adresses
 * publiques sont donc jointes, avec un délai, une taille maximale et un
 * contrôle du type de contenu.
 */
export async function fetchPublicImage(rawUrl: string): Promise<Buffer> {
  assertPublicUrl(rawUrl);

  try {
    const response = await axios.get<ArrayBuffer>(rawUrl, {
      responseType: 'arraybuffer',
      timeout: TIMEOUT_MS,
      maxContentLength: MAX_IMAGE_BYTES,
      maxRedirects: 5,
      headers: { 'User-Agent': BROWSER_UA },
      lookup: publicLookup as never,
      beforeRedirect: (options: Record<string, unknown>) => {
        const protocol = String(options.protocol ?? '');
        const host = String(options.hostname ?? options.host ?? '');
        assertPublicUrl(`${protocol}//${host.includes(':') && !host.startsWith('[') ? `[${host}]` : host}/`);
      },
    });

    const contentType = String(response.headers['content-type'] ?? '').toLowerCase();
    if (!contentType.startsWith('image/')) {
      throw new PublicFetchError("L'URL ne désigne pas une image");
    }
    return Buffer.from(response.data);
  } catch (error) {
    // Un refus levé pendant une redirection arrive enveloppé (AxiosError →
    // RedirectionError → PublicFetchError) : on remonte la chaîne.
    for (let current: unknown = error; current; current = (current as { cause?: unknown }).cause) {
      if (current instanceof PublicFetchError) throw current;
    }
    throw new PublicFetchError("Impossible de télécharger l'image");
  }
}
