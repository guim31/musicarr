'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Pause, Play, Trash2 } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { useConfirm } from '@/context/ConfirmContext';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/ui/api';
import styles from './Debug.module.css';

interface LogLine {
  timestamp: string;
  level: string;
  message: string;
}

const LEVELS = ['all', 'error', 'warn', 'info'] as const;
const LEVEL_LABELS: Record<(typeof LEVELS)[number], string> = { all: 'Tout', error: 'Erreurs', warn: 'Avertissements', info: 'Infos' };

export default function DebugPage() {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('all');
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);
  const confirm = useConfirm();
  const { showToast } = useToast();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const fetchLogs = async () => {
      if (document.hidden) return;
      try {
        const data = await api<{ logs: LogLine[] }>('/api/logs');
        setLogs(data.logs ?? []);
      } catch {
        // Un journal injoignable se voit à l'absence de nouvelles lignes.
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
    if (live) timer = setInterval(fetchLogs, 2000);
    return () => clearInterval(timer);
  }, [live]);

  const visible = useMemo(() => (level === 'all' ? logs : logs.filter(log => log.level === level)), [logs, level]);

  // Rester collé au bas du terminal, sauf si l'on a remonté pour lire.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || visible.length === 0) return;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
    if (!hasScrolled.current || nearBottom) {
      element.scrollTop = element.scrollHeight;
      hasScrolled.current = true;
    }
  }, [visible]);

  const clearLogs = async () => {
    const accepted = await confirm({ title: 'Effacer le journal ?', message: 'Les lignes de cette session seront supprimées.', confirmLabel: 'Effacer', danger: true });
    if (!accepted) return;
    try {
      await api('/api/logs', { method: 'DELETE' });
      setLogs([]);
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  const downloadLogs = () => {
    const text = logs.map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`).join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `musicarr-journal-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <PageHeader
        mark="Face B · Piste 3"
        title="Journal"
        actions={
          <>
            <button type="button" className="btn btn-icon btn-quiet" onClick={() => setLive(value => !value)} aria-pressed={live} aria-label={live ? 'Mettre en pause' : 'Reprendre le suivi'}>
              {live ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button type="button" className="btn btn-icon btn-quiet" onClick={downloadLogs} disabled={logs.length === 0} aria-label="Télécharger le journal">
              <Download size={18} />
            </button>
            <button type="button" className="btn btn-icon btn-danger" onClick={clearLogs} disabled={logs.length === 0} aria-label="Effacer le journal">
              <Trash2 size={18} />
            </button>
          </>
        }
      />

      <div className="chips" role="group" aria-label="Niveau">
        {LEVELS.map(item => (
          <button key={item} type="button" className="chip" aria-pressed={level === item} onClick={() => setLevel(item)}>
            {LEVEL_LABELS[item]}
          </button>
        ))}
      </div>

      <div className={styles.terminal} ref={scrollRef} tabIndex={0} role="log" aria-label="Journal du serveur">
        {loading && logs.length === 0 && <p className={styles.note}>Lecture du journal…</p>}
        {!loading && visible.length === 0 && <p className={styles.note}>Rien pour le moment.</p>}
        {visible.map((log, index) => (
          <div key={index} className={styles.line} data-level={log.level}>
            <time className={styles.time}>{new Date(log.timestamp).toLocaleTimeString('fr-FR')}</time>
            <span className={styles.level}>{log.level}</span>
            <span className={styles.message}>{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
