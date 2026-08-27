/**
 * Vocabulaire canonique des types de sortie.
 *
 * Les trois fournisseurs décrivent la même réalité dans trois langages
 * incompatibles : types primaires/secondaires pour MusicBrainz, `record_type`
 * pour Deezer, chaîne de format libre pour Discogs. Chacun traduisait de son
 * côté, avec des règles différentes — d'où un même disque classé « album »
 * chez l'un et « single » chez l'autre. La traduction vit désormais ici, et
 * nulle part ailleurs.
 */

export const RELEASE_TYPES = [
  'album',
  'ep',
  'single',
  'compilation',
  'live',
  'remix',
  'soundtrack',
  'demo',
  'appearance',
] as const;

export type ReleaseType = (typeof RELEASE_TYPES)[number];

/** Types synchronisés quand l'utilisateur n'a rien précisé. */
export const DEFAULT_SYNC_TYPES: ReleaseType[] = ['album', 'ep'];

/**
 * Priorité utilisée pour départager les fournisseurs sur une même sortie.
 * Plus la valeur est haute, plus le type est « fort » : entre un fournisseur
 * qui annonce un album et un autre un single, l'album l'emporte.
 */
const PRIORITY: Record<ReleaseType, number> = {
  album: 100,
  ep: 80,
  compilation: 70,
  live: 60,
  soundtrack: 55,
  remix: 50,
  demo: 40,
  single: 30,
  appearance: 10,
};

export function typePriority(type: string | null | undefined): number {
  if (!type) return 0;
  return PRIORITY[type as ReleaseType] ?? 0;
}

export function isReleaseType(value: unknown): value is ReleaseType {
  return typeof value === 'string' && (RELEASE_TYPES as readonly string[]).includes(value);
}

/**
 * Nettoie une liste de types venue de l'extérieur (corps de requête API).
 * Renvoie `null` quand rien d'exploitable n'a été fourni — c'est-à-dire
 * « pas de filtre », et non « aucun type ».
 */
export function coerceTypes(input: unknown): ReleaseType[] | null {
  if (!Array.isArray(input)) return null;
  const kept = input.filter(isReleaseType);
  return kept.length > 0 ? Array.from(new Set(kept)) : null;
}

/** Libellés d'interface, au singulier des onglets. */
export const TYPE_LABELS: Record<ReleaseType, string> = {
  album: 'Albums',
  ep: 'EP',
  single: 'Singles',
  compilation: 'Compilations',
  live: 'Live',
  remix: 'Remixes',
  soundtrack: 'Bandes originales',
  demo: 'Démos',
  appearance: 'Apparitions',
};

// ---------------------------------------------------------------------------
// MusicBrainz
// ---------------------------------------------------------------------------

/**
 * Types secondaires MusicBrainz que Musicarr ne gère pas du tout : ce ne sont
 * pas des sorties musicales de l'artiste.
 */
const MB_EXCLUDED_SECONDARY = new Set([
  'interview',
  'spokenword',
  'audiobook',
  'audio drama',
  'field recording',
]);

/**
 * Types secondaires, du plus informatif au moins informatif. Un disque à la
 * fois « Live » et « Compilation » est avant tout un live.
 */
const MB_SECONDARY_ORDER: [string, ReleaseType][] = [
  ['live', 'live'],
  ['soundtrack', 'soundtrack'],
  ['remix', 'remix'],
  ['demo', 'demo'],
  ['dj-mix', 'compilation'],
  ['mixtape/street', 'compilation'],
  ['compilation', 'compilation'],
  ['split', 'appearance'],
];

const MB_PRIMARY: Record<string, ReleaseType> = {
  album: 'album',
  ep: 'ep',
  single: 'single',
  broadcast: 'live',
  other: 'album',
};

/**
 * Traduit un release-group MusicBrainz.
 * Renvoie `null` pour ce qui ne doit pas entrer dans une discographie.
 */
export function fromMusicBrainz(
  primaryType: string | null | undefined,
  secondaryTypes: string[] = [],
): ReleaseType | null {
  const secondary = secondaryTypes.map(t => t.toLowerCase());

  if (secondary.some(t => MB_EXCLUDED_SECONDARY.has(t))) return null;

  for (const [needle, mapped] of MB_SECONDARY_ORDER) {
    if (secondary.includes(needle)) return mapped;
  }

  const primary = primaryType?.toLowerCase();
  if (!primary) return 'album';
  return MB_PRIMARY[primary] ?? 'album';
}

/**
 * Types primaires MusicBrainz à demander au serveur pour couvrir les types
 * canoniques voulus. Filtrer côté serveur évite de paginer des milliers de
 * release-groups pour n'en garder que quelques dizaines.
 */
export function toMusicBrainzPrimaryTypes(types: ReleaseType[]): string[] {
  const primaries = new Set<string>();
  for (const type of types) {
    switch (type) {
      case 'ep':
        primaries.add('ep');
        break;
      case 'single':
        primaries.add('single');
        break;
      case 'appearance':
        // Les « Split » peuvent être portés par n'importe quel type primaire.
        primaries.add('album');
        primaries.add('ep');
        primaries.add('single');
        break;
      default:
        // album, compilation, live, remix, soundtrack, demo sont tous des
        // release-groups de type primaire « album ».
        primaries.add('album');
    }
  }
  return Array.from(primaries);
}

// ---------------------------------------------------------------------------
// Deezer
// ---------------------------------------------------------------------------

const DEEZER_RECORD_TYPES: Record<string, ReleaseType> = {
  album: 'album',
  ep: 'ep',
  single: 'single',
  compile: 'compilation',
  compilation: 'compilation',
};

export function fromDeezer(recordType: string | null | undefined): ReleaseType {
  if (!recordType) return 'album';
  return DEEZER_RECORD_TYPES[recordType.toLowerCase()] ?? 'album';
}

// ---------------------------------------------------------------------------
// Discogs
// ---------------------------------------------------------------------------

export type DiscogsRoleKind = 'main' | 'appearance' | 'credit';

const DISCOGS_APPEARANCE_ROLES = new Set(['appearance', 'trackappearance', 'featuring']);

/**
 * Classe le rôle de l'artiste sur une sortie Discogs.
 *
 * `/artists/{id}/releases` renvoie **tous** les rôles, y compris `Producer`,
 * `Remix`, `Arranged By` ou `Written-By`. Ne pas les distinguer revenait à
 * présenter des centaines de disques produits par l'artiste comme étant les
 * siens — le principal facteur de volume sur les artistes très connus.
 */
export function fromDiscogsRole(role: string | null | undefined): DiscogsRoleKind {
  const normalized = (role || '').toLowerCase().replace(/[\s_-]/g, '');
  if (!normalized || normalized === 'main') return 'main';
  if (DISCOGS_APPEARANCE_ROLES.has(normalized)) return 'appearance';
  return 'credit';
}

/**
 * Traduit la chaîne `format` de Discogs.
 *
 * Elle mélange le **support** (`Vinyl`, `CD`, `12"`) et le **type**
 * (`Album`, `Single`, `EP`, `Compilation`). Seul le type est lu : tester le
 * support faisait de tout maxi 45 tours (`Vinyl, 12", Single`) un album.
 *
 * Renvoie `null` quand le format est absent — c'est le cas des entrées
 * `master`, les plus fiables du lot. Le type est alors résolu par les autres
 * fournisseurs plutôt que deviné.
 */
export function fromDiscogsFormat(format: string | string[] | null | undefined): ReleaseType | null {
  const text = (Array.isArray(format) ? format.join(',') : format || '').toLowerCase();
  if (!text.trim()) return null;

  if (/\bcompilation\b/.test(text)) return 'compilation';
  if (/\bmaxi[- ]?single\b|\bsingle\b/.test(text)) return 'single';
  if (/\bep\b|\bmini[- ]?album\b/.test(text)) return 'ep';
  if (/\balbum\b|\blp\b/.test(text)) return 'album';

  return null;
}
