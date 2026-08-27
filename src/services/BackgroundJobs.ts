import { ImportService } from './ImportService';

/**
 * Tâches de fond du serveur.
 *
 * L'import des téléchargements SABnzbd terminés n'était déclenché qu'en effet
 * de bord du `GET /api/activity` : un `GET` qui déplaçait des fichiers sur le
 * disque, et surtout un import qui ne tournait que si quelqu'un gardait un
 * onglet ouvert. Sur un NAS, c'est-à-dire dans le scénario nominal, les
 * téléchargements s'accumulaient indéfiniment dans `_A_TRIER`.
 */

const IMPORT_INTERVAL_MS = 60_000;

/**
 * Le rechargement à chaud de `next dev` réexécute `register()`. Sans témoin
 * global, chaque rechargement empilerait une minuterie de plus.
 */
const GLOBAL_KEY = Symbol.for('musicarr.backgroundJobs');

interface JobState {
  timer: NodeJS.Timeout;
}

type GlobalWithJobs = typeof globalThis & { [GLOBAL_KEY]?: JobState };

export function startBackgroundJobs(): void {
  const globalScope = globalThis as GlobalWithJobs;
  if (globalScope[GLOBAL_KEY]) return;

  const timer = setInterval(() => {
    ImportService.processSabnzbdDownloads().catch(error => {
      console.error("[Tâches de fond] Import SABnzbd :", error);
    });
  }, IMPORT_INTERVAL_MS);

  // Ne pas retenir la boucle d'événements : le processus doit pouvoir
  // s'arrêter proprement.
  timer.unref?.();

  globalScope[GLOBAL_KEY] = { timer };
  console.log(`[Tâches de fond] Import SABnzbd programmé toutes les ${IMPORT_INTERVAL_MS / 1000} s`);
}

export function stopBackgroundJobs(): void {
  const globalScope = globalThis as GlobalWithJobs;
  const state = globalScope[GLOBAL_KEY];
  if (!state) return;
  clearInterval(state.timer);
  delete globalScope[GLOBAL_KEY];
}
