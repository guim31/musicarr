/**
 * Garde contre les requêtes d'écriture intersites (CSRF).
 *
 * L'application n'a pas d'authentification et son port reste joignable sans
 * portail sur le réseau local. `request.json()` accepte n'importe quel
 * `Content-Type`, y compris `text/plain` : un formulaire ou un `fetch` en mode
 * `no-cors` depuis une page quelconque ouverte dans un navigateur du réseau
 * pouvait donc déclencher un `POST`, un `PATCH` ou un `DELETE` — supprimer un
 * artiste et ses fichiers, changer le chemin de la bibliothèque, lancer des
 * téléchargements.
 *
 * Les navigateurs annoncent l'origine d'une requête (`Sec-Fetch-Site`, et
 * `Origin` sur toute requête d'écriture). Un client HTTP ordinaire — le script
 * cron, `curl` — n'envoie ni l'un ni l'autre : il passe, puisqu'il ne peut pas
 * être piloté par une page web.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Accès en lecture aux en-têtes, compatible avec `Headers` comme avec un objet simple. */
export interface HeaderReader {
  get(name: string): string | null;
}

/**
 * Vrai si la requête est une écriture émise depuis un autre site.
 *
 * - `Sec-Fetch-Site` fait foi quand il est présent : seules `same-origin` et
 *   `none` (saisie directe, favori) passent. `same-site` est refusé : une
 *   autre application du même hôte sur un autre port est « same-site ».
 * - à défaut, `Origin` doit désigner l'hôte servi (`Host`, ou
 *   `X-Forwarded-Host` derrière un proxy qui le transmet) ;
 * - sans aucun des deux, la requête ne vient pas d'un navigateur : elle passe.
 */
export function isCrossSiteWrite(method: string, headers: HeaderReader): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;

  const fetchSite = headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (fetchSite) {
    return fetchSite !== 'same-origin' && fetchSite !== 'none';
  }

  const origin = headers.get('origin')?.trim();
  if (!origin) return false;

  let originHost: string;
  try {
    // `Origin: null` (iframe sandboxée, redirection) n'est pas une URL : refusé.
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return true;
  }

  const servedHosts = [headers.get('host'), headers.get('x-forwarded-host')]
    .flatMap(value => (value ? value.split(',') : []))
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);

  return !servedHosts.includes(originHost);
}
