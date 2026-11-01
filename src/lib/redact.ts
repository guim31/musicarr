/**
 * Masquage des secrets dans tout ce qui est journalisé ou renvoyé au client.
 *
 * Les clés partaient en clair dans le journal en mémoire, que `GET /api/logs`
 * renvoie à quiconque joint le port :
 *
 * - une erreur axios sérialisée par `JSON.stringify` passe par son `toJSON`,
 *   qui inclut `config.url` (`…&apikey=` de SABnzbd) et `config.headers`
 *   (`X-Api-Key` de Prowlarr, cookie `arl` de Deezer) ;
 * - les erreurs HTTP Discogs reprenaient l'URL complète, jeton compris.
 */

const MASK = '***';

/** Paramètres de requête ou de cookie dont la valeur est un secret. */
const SECRET_PARAM =
  /\b(apikey|api_key|api-key|api_token|access_token|license_token|token|arl|sid|password|secret)=([^&\s"';,]+)/gi;

/** En-têtes porteurs de secrets, sous forme JSON (`"X-Api-Key":"…"`) ou texte (`X-Api-Key: …`). */
const SECRET_HEADER = /(["']?)(x-api-key|authorization|cookie)\1(\s*[:=]\s*)(["']?)([^"'\n}]*)\4/gi;

export function redactSecrets(text: string): string {
  return text
    .replace(SECRET_HEADER, (_match, quote, name, separator, valueQuote) =>
      `${quote}${name}${quote}${separator}${valueQuote}${MASK}${valueQuote}`,
    )
    .replace(SECRET_PARAM, (_match, name) => `${name}=${MASK}`);
}

interface AxiosLikeError {
  isAxiosError?: boolean;
  message?: string;
  code?: string;
  config?: { method?: string; url?: string };
  response?: { status?: number };
}

/**
 * Représentation textuelle d'un argument de `console.*`, secrets masqués.
 *
 * Une erreur est réduite à son nom, son message et sa pile : jamais à sa
 * configuration de requête. Un objet circulaire ne fait plus lever
 * `console.log` lui-même.
 */
export function formatLogArg(arg: unknown): string {
  if (typeof arg === 'string') return redactSecrets(arg);

  if (arg instanceof Error) {
    const axiosError = arg as AxiosLikeError;
    let text = arg.stack || `${arg.name}: ${arg.message}`;
    if (axiosError.isAxiosError) {
      const method = axiosError.config?.method?.toUpperCase() ?? '';
      const url = axiosError.config?.url ?? '';
      const status = axiosError.response?.status ? ` → HTTP ${axiosError.response.status}` : '';
      text = `${arg.name}: ${arg.message} [${method} ${url}${status}]`;
    }
    return redactSecrets(text);
  }

  if (arg !== null && typeof arg === 'object') {
    try {
      return redactSecrets(JSON.stringify(arg));
    } catch {
      return redactSecrets(String(arg));
    }
  }

  return redactSecrets(String(arg));
}
