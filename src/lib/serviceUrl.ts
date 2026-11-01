/**
 * Forme canonique de l'adresse d'un service (Prowlarr, SABnzbd), pour savoir
 * si le client vise toujours le service enregistré.
 *
 * Casse de l'hôte, port par défaut et barre finale sont neutralisés. Une
 * chaîne qui n'est pas une URL http(s) valide renvoie `null` : elle ne
 * correspond à rien.
 */
export function normalizeServiceUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const pathname = url.pathname.replace(/\/+$/, '');
    return `${url.protocol}//${url.host.toLowerCase()}${pathname}`;
  } catch {
    return null;
  }
}

/** Vrai si les deux adresses désignent le même service. */
export function isSameServiceUrl(a: unknown, b: unknown): boolean {
  const left = normalizeServiceUrl(a);
  return left !== null && left === normalizeServiceUrl(b);
}
