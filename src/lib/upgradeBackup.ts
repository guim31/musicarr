import fs from 'fs';
import path from 'path';

/**
 * Sauvegardes posées par Deemix avant une mise à niveau d'album.
 *
 * Les fichiers audio existants sont renommés en `…​.upgrade_backup` le temps
 * du téléchargement. Le scan ne lit pas cette extension : tant qu'elles ne
 * sont pas restaurées, l'album paraît vide.
 */
export const BACKUP_SUFFIX = '.upgrade_backup';

/**
 * Annule une mise à niveau : remet les originaux en place et retire les
 * fichiers écrits par le téléchargement qui ne les remplacent pas (même album,
 * autre nom de fichier — sans quoi l'album se retrouvait en double).
 *
 * @param written fichiers écrits par le téléchargement interrompu
 * @returns le nombre d'originaux restaurés
 */
export function rollbackUpgrade(dir: string, written: string[] = []): number {
  if (!fs.existsSync(dir)) return 0;

  const restored = new Set<string>();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(BACKUP_SUFFIX)) continue;
    const backupPath = path.join(dir, file);
    const originalPath = backupPath.slice(0, -BACKUP_SUFFIX.length);
    // rename remplace atomiquement un éventuel fichier partiel du même nom.
    fs.renameSync(backupPath, originalPath);
    restored.add(path.resolve(originalPath));
  }

  if (restored.size > 0) {
    for (const file of written) {
      const resolved = path.resolve(file);
      if (path.dirname(resolved) !== path.resolve(dir) || restored.has(resolved)) continue;
      try {
        fs.unlinkSync(resolved);
      } catch {
        // Déjà absent.
      }
    }
  }

  return restored.size;
}

/** Retire les sauvegardes une fois la mise à niveau réussie. */
export function discardUpgradeBackups(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith(BACKUP_SUFFIX)) fs.unlinkSync(path.join(dir, file));
  }
}
