import { NextResponse } from 'next/server';
import { UserFacingError } from './userFacingError';

export { UserFacingError };

export const INTERNAL_ERROR_MESSAGE = 'Erreur interne du serveur';

/**
 * Réponse d'erreur d'une route API.
 *
 * Les routes renvoyaient `error.message` brut : chemins absolus du NAS,
 * extraits SQL, URL d'API. Seul le message d'une `UserFacingError` est
 * désormais transmis ; le détail des autres reste dans le journal serveur.
 *
 * @param context libellé de journalisation ; à omettre si la route a déjà
 *   journalisé l'erreur.
 */
export function errorResponse(error: unknown, context?: string, status = 500): NextResponse {
  if (context) console.error(context, error);
  const message = error instanceof UserFacingError ? error.message : INTERNAL_ERROR_MESSAGE;
  return NextResponse.json({ error: message }, { status });
}
