'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ACTIVITY_LABELS, describeActive, describeScan, type ActiveItem, type ActiveView, type HistoryEntry, type ScanProgress } from '@/lib/ui/activity';
import { forget } from '@/hooks/useListMemory';
import { useToast } from './ToastContext';

interface ActivityState {
  /** Opérations en cours, scan de la bibliothèque compris. */
  active: ActiveView[];
  scan: ScanProgress | null;
  /** Dernières opérations terminées. */
  recent: HistoryEntry[];
  missingCount: number | null;
  ready: boolean;
  refresh: () => void;
}

const ActivityContext = createContext<ActivityState | undefined>(undefined);

const BUSY_DELAY = 2500;
const IDLE_DELAY = 10_000;

/**
 * Suivi unique de ce qui se passe sur le serveur.
 *
 * Chaque écran n'a plus à interroger l'API de son côté : un seul fil interroge,
 * au rythme de ce qu'il y a à voir, et s'arrête quand l'onglet n'est pas visible
 * — un téléphone en poche ne doit ni vider sa batterie ni réveiller le NAS.
 */
export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  const [items, setItems] = useState<ActiveItem[]>([]);
  const [scan, setScan] = useState<ScanProgress | null>(null);
  const [recent, setRecent] = useState<HistoryEntry[]>([]);
  const [missingCount, setMissingCount] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  const finished = useRef<Set<number> | null>(null);
  const wasScanning = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pollRef = useRef<() => void>(() => {});

  const loadMissing = useCallback(async () => {
    try {
      const response = await fetch('/api/albums/missing?summary=1');
      if (response.ok) setMissingCount((await response.json()).counts?.total ?? null);
    } catch {
      // Le compteur est un confort : il réapparaîtra au prochain événement.
    }
  }, []);

  /**
   * Une opération terminée mérite un mot, dix n'en méritent qu'un seul : au
   * téléphone, une pile de notifications recouvrirait tout l'écran.
   */
  const announce = useCallback(
    (entries: HistoryEntry[]) => {
      if (entries.length === 0) return;
      if (entries.length > 2) {
        const failures = entries.filter(entry => entry.status === 'failed').length;
        showToast(
          failures > 0 ? `dont ${failures} en échec : le détail est dans l’activité.` : 'Le détail est dans l’activité.',
          failures > 0 ? 'error' : 'success',
          `${entries.length} opérations terminées`,
        );
        return;
      }
      for (const entry of entries) {
        const label = ACTIVITY_LABELS[entry.type] ?? 'Opération';
        const failed = entry.status === 'failed';
        // Le message rappelle souvent le titre ; sinon, il faut dire de quel disque on parle.
        const message = entry.message?.includes(entry.title) ? entry.message : [entry.title, entry.message].filter(Boolean).join(' : ');
        showToast(message, failed ? 'error' : 'success', failed ? `${label} en échec` : `${label} terminé${entry.type === 'sync' ? 'e' : ''}`);
      }
    },
    [showToast],
  );

  const poll = useCallback(async () => {
    clearTimeout(timer.current);
    let delay = IDLE_DELAY;
    try {
      const response = await fetch('/api/activity?pageSize=8');
      if (response.ok) {
        const data = await response.json();
        const history: HistoryEntry[] = data.history ?? [];
        const active: ActiveItem[] = data.active ?? [];
        const scanning: ScanProgress | null = data.scan ?? null;

        setItems(active);
        setScan(scanning);
        setRecent(history);
        setReady(true);
        if (active.length > 0 || scanning) delay = BUSY_DELAY;

        const done = history.filter(entry => entry.status === 'completed' || entry.status === 'failed');
        if (finished.current === null) {
          // Premier passage : ce qui est déjà fini ne mérite pas de notification.
          finished.current = new Set(done.map(entry => entry.id));
        } else {
          const seen = finished.current;
          const fresh = done.filter(entry => !seen.has(entry.id));
          if (fresh.length > 0) forget('library:albums');
          for (const entry of fresh) {
            seen.add(entry.id);
            window.dispatchEvent(new CustomEvent('musicarr:activity-finished', { detail: entry }));
          }
          announce(fresh);
          if (fresh.length > 0) loadMissing();
        }

        if (wasScanning.current && !scanning) {
          forget('library:albums');
          showToast('La bibliothèque est à jour.', 'success', 'Scan terminé');
          window.dispatchEvent(new CustomEvent('musicarr:activity-finished', { detail: { type: 'scan' } }));
          loadMissing();
        }
        wasScanning.current = Boolean(scanning);
      }
    } catch {
      // Serveur injoignable : on réessaiera au prochain passage, sans bruit.
    }
    if (!document.hidden) timer.current = setTimeout(() => pollRef.current(), delay);
  }, [showToast, loadMissing, announce]);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    poll();
    loadMissing();
    const onVisibility = () => {
      clearTimeout(timer.current);
      if (!document.hidden) poll();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [poll, loadMissing]);

  const active = useMemo(() => {
    const views = items.map(describeActive);
    return scan ? [describeScan(scan), ...views] : views;
  }, [items, scan]);

  const value = useMemo(
    () => ({ active, scan, recent, missingCount, ready, refresh: poll }),
    [active, scan, recent, missingCount, ready, poll],
  );

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

export function useActivity(): ActivityState {
  const context = useContext(ActivityContext);
  if (!context) throw new Error('useActivity doit être utilisé dans un ActivityProvider');
  return context;
}
