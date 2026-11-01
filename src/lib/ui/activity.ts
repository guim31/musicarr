/**
 * Traduction d'une opération en cours en ce que l'interface doit en dire.
 *
 * `details` est un JSON libre dont la forme dépend de l'origine : Deemix, la
 * file SABnzbd et la synchronisation n'écrivent pas les mêmes champs. Tout se
 * décide ici, pour que le mini-lecteur et la page Activité disent la même chose.
 */

export interface ActiveItem {
  id: string;
  type: string;
  status: string;
  title: string;
  message?: string | null;
  details?: string | null;
  artist_id?: number | null;
  timestamp?: string;
}

export interface HistoryEntry {
  id: number;
  type: string;
  status: string;
  title: string;
  message?: string | null;
  details?: string | null;
  artist_id?: number | null;
  album_id?: number | null;
  artist_name?: string | null;
  timestamp: string;
}

export interface ScanProgress {
  processed: number;
  total: number;
}

export interface ActiveView {
  id: string;
  title: string;
  /** Sous-titre : débit, titres restants… */
  label: string;
  /** Précision de droite : méga-octets restants, source… */
  aside: string;
  /** Entre 0 et 100, ou `null` si l'avancement est inconnu. */
  percent: number | null;
  source: 'deezer' | 'usenet' | 'sync' | 'scan' | 'move' | 'other';
  /** Une entrée de la file SABnzbd n'existe pas en base : rien à supprimer. */
  removable: boolean;
}

function parseDetails(raw: string | null | undefined): Record<string, any> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function clampPercent(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

export function describeActive(item: ActiveItem): ActiveView {
  const details = parseDetails(item.details);
  const isLocal = item.id.startsWith('local-');
  const base = { id: item.id, title: item.title || 'Opération', removable: isLocal };

  if (item.type === 'sync') {
    return {
      ...base,
      source: 'sync',
      label: details.provider
        ? `${details.provider} · ${details.current ?? 0} / ${details.total ?? '?'}`
        : item.message || 'Synchronisation',
      aside: 'Discographie',
      percent: clampPercent(details.progress),
    };
  }

  if (item.type === 'download' && isLocal) {
    const total = Number(details.total) || 0;
    const current = Number(details.current) || 0;
    return {
      ...base,
      source: 'deezer',
      label: total > 0 ? `${current} / ${total} titres` : 'Préparation…',
      aside: 'Deezer',
      percent: total > 0 ? clampPercent((current / total) * 100) : null,
    };
  }

  if (item.type === 'download') {
    return {
      ...base,
      source: 'usenet',
      label: [details.speed, details.timeleft].filter(Boolean).join(' · ') || 'En file d’attente',
      aside: details.mbleft !== undefined ? `${Math.round(Number(details.mbleft))} Mo restants` : 'Usenet',
      percent: clampPercent(details.percentage),
    };
  }

  return {
    ...base,
    source: item.type === 'scan' ? 'scan' : item.type === 'move' ? 'move' : 'other',
    label: item.message || 'En cours…',
    aside: item.type === 'scan' ? 'Scan' : item.type === 'move' ? 'Import' : '',
    percent: details.total ? clampPercent((Number(details.current) / Number(details.total)) * 100) : null,
  };
}

export function describeScan(progress: ScanProgress): ActiveView {
  const initializing = progress.total < 0;
  return {
    id: 'library-scan',
    title: 'Scan de la bibliothèque',
    label: initializing ? 'Inventaire des dossiers…' : `${progress.processed.toLocaleString('fr-FR')} / ${progress.total.toLocaleString('fr-FR')} fichiers`,
    aside: 'Scan',
    percent: initializing || progress.total === 0 ? null : clampPercent((progress.processed / progress.total) * 100),
    source: 'scan',
    removable: false,
  };
}

export const ACTIVITY_LABELS: Record<string, string> = {
  download: 'Téléchargement',
  scan: 'Scan',
  sync: 'Synchronisation',
  move: 'Import',
};

export const STATUS_LABELS: Record<string, string> = {
  completed: 'Terminé',
  failed: 'Échec',
  processing: 'En cours',
  downloading: 'En cours',
  pending: 'Envoyé',
};
