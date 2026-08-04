import path from 'path';
import db from './db';

/**
 * Dossier de cache des pochettes (hors bibliothèque musicale).
 */
export const COVERS_DIR = path.join(process.cwd(), 'data', 'covers');

/**
 * Résout le chemin de la pochette en cache d'un album.
 *
 * L'identifiant provient d'un segment d'URL : il est donc contrôlé par le
 * client et doit être validé. Sans ça, un `id` du type `../../../etc/passwd`
 * (ou sa forme encodée) permet de lire un fichier arbitraire du serveur.
 *
 * @returns le chemin absolu, ou `null` si l'identifiant n'est pas un entier.
 */
export function resolveCoverPath(albumId: string): string | null {
  if (!/^\d+$/.test(albumId)) return null;
  return path.join(COVERS_DIR, `album_${albumId}.jpg`);
}

/**
 * Chemin de la bibliothèque musicale configuré dans les réglages.
 */
export function getLibraryPath(): string | undefined {
  const row = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get('library_path') as { value: string } | undefined;
  return row?.value || undefined;
}

/**
 * Vérifie qu'un chemin se trouve bien à l'intérieur de la bibliothèque.
 *
 * Garde-fou avant toute suppression ou tout déplacement récursif : un champ
 * `path` corrompu en base (scan interrompu, migration, saisie manuelle) ne doit
 * jamais pouvoir viser `/` ou un dossier système.
 */
export function isInsideLibrary(target: string | null | undefined): boolean {
  if (!target) return false;

  const libraryPath = getLibraryPath();
  if (!libraryPath) return false;

  const resolvedLibrary = path.resolve(libraryPath);
  const resolvedTarget = path.resolve(target);

  // Refuse la bibliothèque elle-même : on ne supprime jamais la racine.
  if (resolvedTarget === resolvedLibrary) return false;

  return resolvedTarget.startsWith(resolvedLibrary + path.sep);
}
