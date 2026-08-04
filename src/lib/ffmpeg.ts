import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Durée maximale d'un appel ffmpeg (un remux `-c copy` ne dure jamais aussi longtemps). */
const FFMPEG_TIMEOUT_MS = 120_000;

/** Taille max de stdout/stderr capturée, pour éviter de saturer la mémoire. */
const FFMPEG_MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Exécute ffmpeg avec un tableau d'arguments.
 *
 * ⚠️ Ne JAMAIS revenir à `exec()` avec une commande construite par
 * concaténation : les titres, artistes et noms d'albums proviennent de
 * l'utilisateur ou d'API externes et peuvent contenir des métacaractères shell
 * (`$(…)`, backticks, `;`, `&&`) menant à une exécution de code arbitraire.
 * `execFile` ne passe pas par un shell : les arguments sont transmis tels quels.
 */
export async function runFfmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('ffmpeg', args, {
    timeout: FFMPEG_TIMEOUT_MS,
    maxBuffer: FFMPEG_MAX_BUFFER,
  });
}

/**
 * Construit les arguments `-metadata clé=valeur` pour ffmpeg.
 *
 * Les entrées `null`, `undefined` et chaînes vides sont ignorées. Les
 * caractères de contrôle et retours à la ligne sont retirés : ffmpeg les
 * interprète comme des séparateurs dans certains conteneurs.
 */
export function metadataArgs(tags: Record<string, string | number | null | undefined>): string[] {
  const args: string[] = [];

  for (const [key, rawValue] of Object.entries(tags)) {
    if (rawValue === null || rawValue === undefined) continue;

    const value = String(rawValue)
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .trim();

    if (!value) continue;

    args.push('-metadata', `${key}=${value}`);
  }

  return args;
}
