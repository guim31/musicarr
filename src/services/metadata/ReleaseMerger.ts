import { CompareUtils } from '@/lib/CompareUtils';
import type { RemoteAlbum } from './types';
import { type ReleaseType, typePriority } from './releaseTypes';

/** Discographie brute telle que renvoyée par un fournisseur. */
export interface SourceDiscography {
  provider: string;
  albums: RemoteAlbum[];
}

/** Une sortie, toutes sources et toutes éditions confondues. */
export interface MergedRelease {
  releaseKey: string;
  title: string;
  type: ReleaseType;
  firstReleaseDate?: string;
  image?: string;
  mbid?: string;
  discogsId?: string;
  deezerId?: string;
  /** Fournisseurs qui connaissent cette sortie, dans l'ordre de fiabilité. */
  sources: string[];
}

/**
 * Fiabilité relative des fournisseurs sur le **type** d'une sortie.
 * MusicBrainz est le seul à disposer d'une taxonomie explicite et revue ;
 * Discogs déduit d'une chaîne de format, et n'en a pas toujours une.
 */
const TYPE_AUTHORITY: Record<string, number> = {
  musicbrainz: 3,
  deezer: 2,
  discogs: 1,
};

/**
 * Fiabilité relative sur la **pochette**. Deezer sert des images en haute
 * définition ; l'URL Cover Art Archive de MusicBrainz est souvent absente et
 * la vignette Discogs fait 150 px.
 */
const IMAGE_AUTHORITY: Record<string, number> = {
  deezer: 3,
  discogs: 2,
  musicbrainz: 1,
};

/** Écarte les dates manifestement fausses plutôt que de les propager. */
function usableDate(date: string | undefined): string | undefined {
  if (!date) return undefined;
  const year = Number(date.slice(0, 4));
  if (!Number.isFinite(year) || year < 1877 || year > new Date().getFullYear() + 2) {
    return undefined;
  }
  return date;
}

interface Candidate {
  provider: string;
  album: RemoteAlbum;
}

/**
 * Choisit le titre d'affichage d'un groupe.
 *
 * On préfère un titre qui ne porte aucune mention d'édition — c'est-à-dire
 * celui dont la forme normalisée est déjà la clé de regroupement. À défaut,
 * le plus court, qui est en pratique le moins encombré.
 */
function pickTitle(candidates: Candidate[], releaseKey: string): string {
  const clean = candidates.filter(c => CompareUtils.normalize(c.album.name) === releaseKey);
  const pool = clean.length > 0 ? clean : candidates;
  return pool.reduce((best, current) =>
    current.album.name.length < best.album.name.length ? current : best,
  ).album.name;
}

/** Retient le type annoncé par le fournisseur le plus fiable qui en connaît un. */
function pickType(candidates: Candidate[]): ReleaseType {
  let best: { type: ReleaseType; authority: number } | null = null;

  for (const { provider, album } of candidates) {
    if (!album.type) continue;
    const authority = TYPE_AUTHORITY[provider] ?? 0;
    if (
      !best ||
      authority > best.authority ||
      (authority === best.authority && typePriority(album.type) > typePriority(best.type))
    ) {
      best = { type: album.type, authority };
    }
  }

  // Aucun fournisseur ne savait : c'est presque toujours une entrée `master`
  // de Discogs, donc un album.
  return best?.type ?? 'album';
}

function pickImage(candidates: Candidate[]): string | undefined {
  let best: { image: string; authority: number } | null = null;
  for (const { provider, album } of candidates) {
    if (!album.image) continue;
    const authority = IMAGE_AUTHORITY[provider] ?? 0;
    if (!best || authority > best.authority) best = { image: album.image, authority };
  }
  return best?.image;
}

/**
 * Fusionne les discographies de plusieurs fournisseurs en une liste unique.
 *
 * Le regroupement se fait sur `CompareUtils.releaseKey`, donc éditions
 * confondues et **type exclu** de la clé : les fournisseurs se contredisent
 * régulièrement sur le type, et l'inclure recréait un doublon à chaque
 * désaccord. Le type est résolu après coup, par autorité.
 */
export function mergeDiscographies(sources: SourceDiscography[]): MergedRelease[] {
  const groups = new Map<string, Candidate[]>();

  for (const { provider, albums } of sources) {
    for (const album of albums) {
      const key = CompareUtils.releaseKey(album.name);
      if (!key) continue;
      const group = groups.get(key);
      if (group) group.push({ provider, album });
      else groups.set(key, [{ provider, album }]);
    }
  }

  const merged: MergedRelease[] = [];

  for (const [releaseKey, candidates] of groups) {
    let firstReleaseDate: string | undefined;
    for (const { album } of candidates) {
      const date = usableDate(album.releaseDate);
      // La date la plus ancienne est la date de sortie d'origine : les autres
      // sont des dates de réédition.
      if (date && (!firstReleaseDate || date < firstReleaseDate)) firstReleaseDate = date;
    }

    const sources = Array.from(new Set(candidates.map(c => c.provider))).sort(
      (a, b) => (TYPE_AUTHORITY[b] ?? 0) - (TYPE_AUTHORITY[a] ?? 0),
    );

    merged.push({
      releaseKey,
      title: pickTitle(candidates, releaseKey),
      type: pickType(candidates),
      firstReleaseDate,
      image: pickImage(candidates),
      mbid: candidates.find(c => c.album.mbid)?.album.mbid,
      discogsId: candidates.find(c => c.album.discogsId)?.album.discogsId,
      deezerId: candidates.find(c => c.album.deezerId)?.album.deezerId,
      sources,
    });
  }

  // Plus récent d'abord ; les sorties sans date connue en fin de liste.
  return merged.sort((a, b) => {
    const dateA = a.firstReleaseDate ?? '';
    const dateB = b.firstReleaseDate ?? '';
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return a.title.localeCompare(b.title, 'fr');
  });
}
