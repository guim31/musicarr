/**
 * Client HTTP JSON commun aux fournisseurs de métadonnées.
 *
 * Regroupe ce que chaque provider réimplémentait — mal — de son côté :
 *
 * - **annulation réelle** : le signal est passé à `fetch`. Le motif précédent
 *   (`Promise.race` avec un `setTimeout`) abandonnait l'attente mais laissait
 *   la pagination tourner et marteler l'API en arrière-plan ;
 * - **limitation de débit par hôte**, sérialisée : MusicBrainz impose 1 req/s,
 *   Discogs 60 req/min ;
 * - **reprise sur 429 / 5xx** avec repli exponentiel et respect de
 *   `Retry-After`. Sans elle, un seul 503 au milieu d'une pagination faisait
 *   perdre toute la discographie.
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    message?: string,
  ) {
    super(message || `HTTP ${status} sur ${url}`);
    this.name = 'HttpError';
  }
}

export interface FetchJsonOptions {
  headers?: Record<string, string>;
  /** Signal d'annulation de l'appelant, combiné au délai d'expiration. */
  signal?: AbortSignal;
  /** Délai d'expiration de la requête, par tentative. Défaut : 20 s. */
  timeoutMs?: number;
  /** Nombre de reprises sur 429 / 5xx. Défaut : 2. */
  retries?: number;
  /** Clé de limitation de débit — en pratique le nom du fournisseur. */
  throttleKey?: string;
  /** Intervalle minimal entre deux requêtes portant la même clé. */
  throttleMs?: number;
  /** Renvoyer `null` sur une réponse 4xx au lieu de lever. */
  nullOn4xx?: boolean;
}

/** Codes sur lesquels une reprise a du sens : congestion ou indisponibilité passagère. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/**
 * Une file d'attente par clé. Sérialiser les appels est le seul moyen fiable
 * de tenir un quota : compter les requêtes sans les ordonner laisse passer
 * des rafales dès que deux paginations se chevauchent.
 */
const queues = new Map<string, Promise<void>>();

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Annulé'));
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Fait attendre l'appelant son tour dans la file de `key`, puis l'intervalle requis. */
async function throttle(key: string, minIntervalMs: number, signal?: AbortSignal): Promise<void> {
  const previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => {
    release = resolve;
  });
  queues.set(
    key,
    previous.then(() => current),
  );

  await previous;
  try {
    await delay(minIntervalMs, signal);
  } finally {
    // Libérer la file même en cas d'annulation : sinon toute la file se bloque.
    setTimeout(release, 0);
  }
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

/**
 * Récupère et décode une réponse JSON.
 *
 * Lève une `HttpError` sur un statut non reprenable (ou après épuisement des
 * reprises), `null` sur 4xx si `nullOn4xx` est demandé.
 */
export async function fetchJson<T = unknown>(
  url: string | URL,
  options: FetchJsonOptions = {},
): Promise<T | null> {
  const {
    headers,
    signal,
    timeoutMs = 20_000,
    retries = 2,
    throttleKey,
    throttleMs = 0,
    nullOn4xx = false,
  } = options;

  const target = url.toString();
  let attempt = 0;

  for (;;) {
    if (signal?.aborted) throw signal.reason ?? new Error('Annulé');

    if (throttleKey && throttleMs > 0) {
      await throttle(throttleKey, attempt === 0 ? throttleMs : 0, signal);
    }

    // `AbortSignal.any` combine l'annulation de l'appelant et le délai
    // d'expiration : le premier qui parle interrompt réellement la requête.
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await fetch(target, { headers, signal: combined, cache: 'no-store' });
    } catch (error) {
      // Une annulation demandée par l'appelant n'est pas une panne réseau :
      // elle ne se rejoue pas.
      if (signal?.aborted) throw signal.reason ?? error;
      if (attempt >= retries) throw error;
      attempt += 1;
      await delay(backoffMs(attempt), signal);
      continue;
    }

    if (response.ok) {
      return (await response.json()) as T;
    }

    if (RETRYABLE.has(response.status) && attempt < retries) {
      attempt += 1;
      await delay(retryAfterMs(response) ?? backoffMs(attempt), signal);
      continue;
    }

    if (nullOn4xx && response.status >= 400 && response.status < 500) {
      return null;
    }

    throw new HttpError(response.status, target, `HTTP ${response.status} ${response.statusText} sur ${target}`);
  }
}

function backoffMs(attempt: number): number {
  // 1 s, 2 s, 4 s… plafonné à 15 s.
  return Math.min(15_000, 1000 * 2 ** (attempt - 1));
}

/** Réinitialise les files d'attente — utile aux tests. */
export function resetThrottles(): void {
  queues.clear();
}
