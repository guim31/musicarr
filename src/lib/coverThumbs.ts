import fs from 'fs';
import path from 'path';
import { runFfmpeg } from './ffmpeg';
import { COVERS_DIR } from './paths';

/**
 * Vignettes de pochettes.
 *
 * Les pochettes en cache gardent leur taille d'origine, parfois près d'un
 * mégaoctet : un mur de 48 disques pesait des dizaines de mégaoctets, à
 * transporter en 4G pour un affichage de 200 pixels de large. La vignette est
 * calculée au premier appel avec le ffmpeg de l'image, puis gardée sur le disque.
 */

/** Largeurs servies : une liste fermée, pour qu'un client ne puisse pas remplir le disque. */
export const THUMB_WIDTHS = [160, 320, 640] as const;

const THUMBS_DIR = path.join(COVERS_DIR, 'thumbs');

/** Un mur de pochettes demande des dizaines de vignettes d'un coup : pas de ffmpeg en parallèle sans limite. */
const MAX_CONCURRENT = 2;

let running = 0;
const waiting: (() => void)[] = [];
const inFlight = new Map<string, Promise<string | null>>();

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) {
    await new Promise<void>(resolve => waiting.push(resolve));
  }
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

/** Largeur demandée, si elle fait partie de celles qu'on sert. */
export function parseThumbWidth(raw: string | null): number | null {
  if (!raw) return null;
  const width = Number(raw);
  return (THUMB_WIDTHS as readonly number[]).includes(width) ? width : null;
}

async function generate(source: string, target: string, width: number): Promise<string | null> {
  const temp = `${target}.${process.pid}.tmp.jpg`;
  try {
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await runFfmpeg([
      '-v', 'error',
      '-y',
      '-i', source,
      '-vf', `scale='min(${width},iw)':-2`,
      '-frames:v', '1',
      '-q:v', '5',
      temp,
    ]);
    await fs.promises.rename(temp, target);
    return target;
  } catch (error) {
    console.error('[Vignettes] Génération impossible :', (error as Error).message);
    await fs.promises.unlink(temp).catch(() => {});
    return null;
  }
}

/**
 * Chemin de la vignette, à jour de la pochette source.
 *
 * @returns `null` si elle n'a pas pu être produite : l'appelant sert alors l'original.
 */
export async function resolveThumb(albumId: string, source: string, width: number): Promise<string | null> {
  const target = path.join(THUMBS_DIR, `album_${albumId}_${width}.jpg`);

  const [sourceStat, targetStat] = await Promise.all([
    fs.promises.stat(source),
    fs.promises.stat(target).catch(() => null),
  ]);
  // Une pochette remplacée depuis l'éditeur de tags rend sa vignette caduque.
  if (targetStat && targetStat.mtimeMs >= sourceStat.mtimeMs) return target;

  const pending = inFlight.get(target);
  if (pending) return pending;

  const job = withSlot(() => generate(source, target, width)).finally(() => inFlight.delete(target));
  inFlight.set(target, job);
  return job;
}
