/** Mise en forme partagée par les écrans. Aucune dépendance au DOM. */

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count.toLocaleString('fr-FR')} ${count > 1 ? pluralForm : singular}`;
}

export function formatDuration(seconds?: number | null): string {
  if (!seconds || Number.isNaN(seconds)) return '–';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

/** Durée totale d'un disque : « 58 min », « 1 h 12 ». */
export function formatRuntime(seconds: number): string {
  if (!seconds) return '';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${(minutes % 60).toString().padStart(2, '0')}`;
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1).replace('.', ',')} Go`;
  return `${Math.round(mb)} Mo`;
}

export function formatYear(date?: string | null): string {
  return date ? date.slice(0, 4) : '';
}

/**
 * Libellé lisible d'un format. Le scan stocke le conteneur tel que le rapporte
 * `music-metadata` : « MPEG » désigne en pratique du MP3.
 */
export function formatQuality(quality?: string | null): string {
  if (!quality || quality === 'Unknown') return '';
  const upper = quality.toUpperCase();
  if (upper === 'MPEG' || upper.startsWith('MPEG ')) return 'MP3';
  if (upper === 'WAVE') return 'WAV';
  return upper;
}

export function isLossless(quality?: string | null): boolean {
  return ['FLAC', 'WAV', 'ALAC'].includes(formatQuality(quality));
}

/** La base stocke `CURRENT_TIMESTAMP` en UTC, sans le dire. */
function parseTimestamp(value: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`);
}

const relativeFormat = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

export function timeAgo(value?: string | null): string {
  if (!value) return '';
  const date = parseTimestamp(value);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return 'à l’instant';
  if (abs < 3600) return relativeFormat.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relativeFormat.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86_400 * 30) return relativeFormat.format(Math.round(seconds / 86_400), 'day');
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '';
  const date = parseTimestamp(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Empreinte stable d'une chaîne : même nom, même couleur, à chaque visite. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Léger angle de collage, reproductible, pour que tout ne soit pas au cordeau. */
export function tiltFor(seed: string, range = 7): string {
  const hash = hashString(seed);
  return `${((hash % (range * 20 + 1)) / 10 - range).toFixed(1)}deg`;
}

const PAPERS = ['var(--acid)', 'var(--hot)', 'var(--aqua)', 'var(--paper)', 'var(--orange)'] as const;

/** Papier de couleur sur lequel on photocopie un artiste ou une pochette. */
export function paperFor(seed: string): string {
  return PAPERS[hashString(seed) % PAPERS.length];
}

/** Lettre de l'intercalaire d'un artiste : « # » pour tout ce qui n'est pas une lettre. */
export function dividerFor(name: string): string {
  const first = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .charAt(0)
    .toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}
