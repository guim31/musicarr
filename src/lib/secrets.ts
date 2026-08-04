import db from './db';

/**
 * Valeur renvoyée au client à la place d'un secret configuré.
 *
 * Le navigateur n'a jamais besoin de connaître les clés API : il lui suffit de
 * savoir qu'elles sont renseignées. Ce marqueur sert d'aller-retour — s'il
 * revient inchangé lors d'un enregistrement, c'est que l'utilisateur n'a pas
 * touché au champ, et la valeur stockée est conservée.
 */
export const MASKED_SECRET = '••••••••';

/**
 * Masque un secret pour l'affichage : le marqueur s'il est renseigné, une
 * chaîne vide sinon (l'interface affiche alors un champ vierge).
 */
export function maskSecret(value: string | undefined | null): string {
  return value ? MASKED_SECRET : '';
}

/**
 * Résout la valeur réelle d'un secret à partir de ce qu'a envoyé le client.
 *
 * - champ absent ou marqueur inchangé → on garde la valeur en base ;
 * - chaîne vide explicite → l'utilisateur efface le secret ;
 * - toute autre valeur → nouveau secret.
 *
 * À utiliser aussi bien à l'enregistrement que pour les actions « tester la
 * connexion », qui ont besoin de la vraie clé sans jamais l'exposer au client.
 */
export function resolveSecret(incoming: unknown, settingKey: string): string {
  if (incoming === undefined || incoming === null || incoming === MASKED_SECRET) {
    return getStoredSecret(settingKey);
  }
  return String(incoming);
}

/** Lit un secret en base. Chaîne vide s'il n'est pas configuré. */
export function getStoredSecret(settingKey: string): string {
  const row = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(settingKey) as { value: string } | undefined;
  return row?.value || '';
}
