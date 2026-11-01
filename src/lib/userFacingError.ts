/**
 * Erreur dont le message est rédigé pour l'utilisateur (« ARL Deezer non
 * configuré ») et peut donc lui être renvoyé tel quel par l'API.
 *
 * Séparée de `apiError.ts` pour que les services n'importent pas
 * `next/server`.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}
