'use client';

import { useEffect, useLayoutEffect } from 'react';

/**
 * Mémoire de liste, le temps de la session.
 *
 * Ouvrir un disque puis revenir en arrière ne doit pas renvoyer en haut de
 * 800 pochettes. L'application restant chargée entre deux écrans, une simple
 * table en mémoire suffit à retrouver les éléments déjà chargés et la position.
 */
const memory = new Map<string, { value: unknown; savedAt: number }>();
const scrollPositions = new Map<string, number>();

const MAX_AGE_MS = 15 * 60_000;

export function recall<T>(key: string): T | undefined {
  const entry = memory.get(key);
  if (!entry || Date.now() - entry.savedAt > MAX_AGE_MS) return undefined;
  return entry.value as T;
}

export function remember(key: string, value: unknown): void {
  memory.set(key, { value, savedAt: Date.now() });
}

export function forget(key: string): void {
  memory.delete(key);
}

// `useLayoutEffect` avertit au rendu serveur ; le nôtre ne fait rien de visible là-bas.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Restaure la position de défilement dès que `ready` passe à vrai, et la retient au départ. */
export function useScrollMemory(key: string, ready: boolean) {
  useIsomorphicLayoutEffect(() => {
    if (!ready) return;
    const saved = scrollPositions.get(key);
    if (saved) window.scrollTo(0, saved);
  }, [key, ready]);

  useEffect(() => {
    const save = () => {
      scrollPositions.set(key, window.scrollY);
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [key]);
}
