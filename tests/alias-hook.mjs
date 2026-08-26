/**
 * Résolution des imports pour les tests exécutés par Node.
 *
 * Node applique le « type stripping » natif aux fichiers `.ts` mais ne connaît
 * ni l'alias `@/` du projet, ni la résolution sans extension de TypeScript.
 * Ce crochet comble les deux, sans ajouter de dépendance ni d'étape de build.
 */
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

function resolveOnDisk(basePath) {
  if (path.extname(basePath) && existsSync(basePath)) return basePath;
  for (const candidate of [
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, 'index.ts'),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let basePath = null;

    if (specifier.startsWith('@/')) {
      basePath = path.join(SRC_ROOT, specifier.slice(2));
    } else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      basePath = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    }

    const resolved = basePath && resolveOnDisk(basePath);
    if (resolved) {
      return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});
