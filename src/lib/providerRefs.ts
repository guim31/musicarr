/**
 * Extraction d'identifiants de fournisseur depuis ce que l'utilisateur colle.
 *
 * Sert au rattachement manuel d'un artiste : c'est la porte de sortie
 * indispensable pour les homonymes, que la recherche automatique ne peut pas
 * départager — et qu'elle ne doit surtout pas départager au hasard.
 */

export type ProviderRefKind = 'mbid' | 'discogsId' | 'deezerId';

export interface ProviderRef {
  kind: ProviderRefKind;
  id: string;
}

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const URL_PATTERNS: [RegExp, ProviderRefKind][] = [
  [/musicbrainz\.org\/artist\/([0-9a-f-]{36})/i, 'mbid'],
  [/discogs\.com\/(?:[a-z]{2}\/)?artist\/(\d+)/i, 'discogsId'],
  [/deezer\.com\/(?:[a-z]{2}\/)?artist\/(\d+)/i, 'deezerId'],
];

/**
 * Reconnaît une URL d'artiste, un MBID nu, ou un identifiant numérique
 * accompagné de son fournisseur.
 *
 * Renvoie `null` plutôt que de deviner : un identifiant numérique seul, sans
 * fournisseur, est ambigu entre Discogs et Deezer.
 */
export function parseProviderRef(input: string, hint?: ProviderRefKind): ProviderRef | null {
  const value = input.trim();
  if (!value) return null;

  for (const [pattern, kind] of URL_PATTERNS) {
    const match = value.match(pattern);
    if (match) return { kind, id: match[1] };
  }

  if (MBID.test(value)) return { kind: 'mbid', id: value.toLowerCase() };

  if (/^\d+$/.test(value) && (hint === 'discogsId' || hint === 'deezerId')) {
    return { kind: hint, id: value };
  }

  return null;
}
