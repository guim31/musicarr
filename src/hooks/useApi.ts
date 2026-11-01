'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/ui/api';

interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/**
 * Lecture d'une ressource de l'API.
 *
 * Une réponse lente ne peut pas écraser celle d'une requête plus récente : la
 * précédente est annulée. `reload` ne repasse pas par l'état de chargement, pour
 * qu'un rafraîchissement ne fasse pas clignoter un écran déjà affiché.
 */
export function useApi<T>(url: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(url !== null);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (url === null) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    try {
      const result = await api<T>(url, { signal: current.signal });
      if (current.signal.aborted) return;
      setData(result);
      setError(null);
    } catch (cause) {
      if (current.signal.aborted) return;
      setError((cause as Error).message);
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
    return () => controller.current?.abort();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}

/** Exécute `callback` à chaque fin d'opération signalée par le suivi d'activité. */
export function useActivityFinished(callback: (detail: { type?: string; album_id?: number; artist_id?: number }) => void) {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });
  useEffect(() => {
    const handler = (event: Event) => latest.current((event as CustomEvent).detail ?? {});
    window.addEventListener('musicarr:activity-finished', handler);
    return () => window.removeEventListener('musicarr:activity-finished', handler);
  }, []);
}
