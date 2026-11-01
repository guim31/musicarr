/**
 * Transforme un nom venu de l'extérieur (saisie, tag de fichier, API Deezer)
 * en **un seul** segment de chemin.
 *
 * Les noms d'artiste et d'album deviennent des dossiers. Passés tels quels à
 * `path.join`, un séparateur les découpe en plusieurs niveaux (« AC/DC »
 * créait `AC/DC/`) et `..` remonte au-dessus de la bibliothèque : un artiste
 * nommé `../../tmp` faisait créer, déplacer ou modifier des dossiers hors du
 * partage musical.
 *
 * Seuls les séparateurs, les caractères de contrôle et les noms réservés
 * `.` / `..` sont traités : le reste du nom est conservé, pour que les
 * dossiers existants continuent d'être retrouvés.
 */
export function safePathSegment(name: string | null | undefined, fallback = 'UNKNOWN'): string {
  const cleaned = String(name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\\u0000-\u001f\u007f]+/g, '_')
    .trim();

  if (!cleaned || /^\.+$/.test(cleaned)) return fallback;
  return cleaned;
}
