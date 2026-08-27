/**
 * Point d'entrée appelé une fois par instance de serveur Next.js, avant de
 * servir la première requête. C'est le seul endroit où accrocher un travail
 * périodique côté serveur sans dépendre d'un client connecté.
 */
export async function register() {
  // `register` est appelé pour chaque runtime ; les tâches de fond touchent au
  // système de fichiers et à SQLite, donc uniquement sous Node.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { startBackgroundJobs } = await import('./services/BackgroundJobs');
  startBackgroundJobs();
}
