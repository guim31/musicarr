'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Clock, Database, Download, Move, RefreshCw, Trash2, X, type LucideIcon } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import ProgressTape from '@/components/ui/ProgressTape';
import { useActivity } from '@/context/ActivityContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useToast } from '@/context/ToastContext';
import { useActivityFinished } from '@/hooks/useApi';
import { ACTIVITY_LABELS, STATUS_LABELS, type ActiveView, type HistoryEntry } from '@/lib/ui/activity';
import { api, postJson } from '@/lib/ui/api';
import { formatDateTime, plural, timeAgo } from '@/lib/ui/format';
import styles from './Activity.module.css';

const ICONS: Record<string, LucideIcon> = { download: Download, scan: Database, sync: RefreshCw, move: Move };

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'Tout' },
  { key: 'download', label: 'Téléchargements' },
  { key: 'sync', label: 'Synchronisations' },
  { key: 'scan', label: 'Scans' },
  { key: 'failed', label: 'Échecs' },
];

const PAGE_SIZE = 30;

const SOURCE_TONE: Record<ActiveView['source'], string> = {
  deezer: 'sticker-flac',
  usenet: 'sticker-aqua',
  sync: 'sticker-hot',
  scan: '',
  move: '',
  other: '',
};

export default function ActivityPage() {
  const { active, refresh } = useActivity();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (targetPage: number, replace: boolean) => {
      setLoading(true);
      try {
        const data = await api<{ history: HistoryEntry[]; total: number }>(
          `/api/activity?page=${targetPage}&pageSize=${PAGE_SIZE}${filter ? `&type=${filter}` : ''}`,
        );
        setHistory(current => {
          if (replace) return data.history;
          const known = new Set(current.map(entry => entry.id));
          return [...current, ...data.history.filter(entry => !known.has(entry.id))];
        });
        setTotal(data.total);
        setPage(targetPage);
      } catch (error) {
        showToast((error as Error).message, 'error');
      } finally {
        setLoading(false);
      }
    },
    [filter, showToast],
  );

  useEffect(() => {
    load(1, true);
  }, [load]);

  useActivityFinished(() => load(1, true));

  const clearHistory = async () => {
    const accepted = await confirm({
      title: 'Effacer l’historique ?',
      message: 'Toutes les opérations passées seront oubliées. Les fichiers ne sont pas touchés.',
      confirmLabel: 'Effacer',
      danger: true,
    });
    if (!accepted) return;
    try {
      await postJson('/api/activity', { action: 'delete_history' });
      showToast('Historique effacé.', 'success');
      load(1, true);
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  const removeActive = async (item: ActiveView) => {
    const accepted = await confirm({
      title: 'Retirer de la liste ?',
      message: 'L’opération disparaît du suivi, mais ne s’interrompt pas si elle tourne encore.',
      confirmLabel: 'Retirer',
    });
    if (!accepted) return;
    try {
      await postJson('/api/activity', { action: 'delete_history', id: item.id.replace('local-', '') });
      refresh();
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  const removeEntry = async (entry: HistoryEntry) => {
    // Pas de confirmation : une ligne d'historique ne vaut pas une question.
    setHistory(current => current.filter(item => item.id !== entry.id));
    setTotal(count => Math.max(0, count - 1));
    try {
      await postJson('/api/activity', { action: 'delete_history', id: entry.id });
    } catch (error) {
      showToast((error as Error).message, 'error');
      load(1, true);
    }
  };

  return (
    <div className="page">
      <PageHeader
        mark="Face A · Piste 4"
        title="Activité"
        actions={
          <button type="button" className="btn btn-quiet btn-collapse" onClick={clearHistory} aria-label="Effacer l’historique" disabled={total === 0}>
            <Trash2 size={18} />
            <span>Effacer l’historique</span>
          </button>
        }
      />

      <section className={styles.now} aria-labelledby="en-ce-moment">
        <h2 id="en-ce-moment" className="tape tape-aqua">
          En ce moment {active.length > 0 && `· ${active.length}`}
        </h2>
        {active.length === 0 ? (
          <p className={`hand ${styles.quiet}`}>Calme plat. Le bac dort.</p>
        ) : (
          <ul className={styles.activeList}>
            {active.map(item => (
              <li key={item.id} className={styles.activeCard}>
                <div className={styles.activeHead}>
                  <span className="mini-record" aria-hidden="true" />
                  <div className={styles.activeText}>
                    <h3 className="clamp-2">{item.title}</h3>
                    <p className="mono muted">{item.label}</p>
                  </div>
                  {item.removable && (
                    <button type="button" className="btn btn-sm btn-icon btn-quiet" onClick={() => removeActive(item)} aria-label={`Retirer ${item.title} de la liste`}>
                      <X size={16} />
                    </button>
                  )}
                </div>
                <ProgressTape percent={item.percent} label={item.title} className={styles.tape} />
                <div className={`mono ${styles.activeFoot}`}>
                  <span className={`sticker ${SOURCE_TONE[item.source]}`}>{item.aside || 'En cours'}</span>
                  {item.percent !== null && <span className={`display ${styles.percent}`}>{Math.round(item.percent)}%</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.history} aria-labelledby="historique">
        <h2 id="historique" className={`display ${styles.heading}`}>
          Historique
        </h2>
        <div className="chips" role="group" aria-label="Filtrer l’historique">
          {FILTERS.map(item => (
            <button key={item.key} type="button" className="chip" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>
              {item.label}
            </button>
          ))}
        </div>

        {!loading && history.length === 0 ? (
          <div className="empty">
            <p className="hand">Page blanche.</p>
            <p>{filter ? 'Rien de ce type pour le moment.' : 'Les téléchargements, scans et synchronisations s’inscriront ici.'}</p>
          </div>
        ) : (
          <ol className={styles.timeline}>
            {history.map(entry => (
              <HistoryRow key={entry.id} entry={entry} onRemove={removeEntry} />
            ))}
          </ol>
        )}

        {history.length < total && (
          <button type="button" className={`btn btn-quiet btn-block ${styles.more}`} onClick={() => load(page + 1, false)} disabled={loading}>
            {loading ? 'Chargement…' : `Voir plus (${(total - history.length).toLocaleString('fr-FR')} restantes)`}
          </button>
        )}
        {history.length > 0 && <p className={`mono ${styles.total}`}>{plural(total, 'opération')} au registre</p>}
      </section>
    </div>
  );
}

function HistoryRow({ entry, onRemove }: { entry: HistoryEntry; onRemove: (entry: HistoryEntry) => void }) {
  const failed = entry.status === 'failed';
  const pending = entry.status === 'pending';
  const Icon = failed ? AlertTriangle : pending ? Clock : (ICONS[entry.type] ?? Check);
  return (
    <li className={styles.entry} data-status={entry.status}>
      <span className={styles.entryIcon}>
        <Icon size={15} aria-hidden="true" />
      </span>
      <div className={styles.entryBody}>
        <h3 className={styles.entryTitle}>
          {entry.artist_id ? <Link href={`/library/artist/${entry.artist_id}`}>{entry.title}</Link> : entry.title}
        </h3>
        {entry.message && <p className={styles.entryMessage}>{entry.message}</p>}
        <p className={`mono ${styles.entryMeta}`}>
          <span title={formatDateTime(entry.timestamp)}>{timeAgo(entry.timestamp)}</span>
          <span>{ACTIVITY_LABELS[entry.type] ?? entry.type}</span>
          <span className={styles.entryStatus}>{STATUS_LABELS[entry.status] ?? entry.status}</span>
        </p>
      </div>
      <button type="button" className={styles.entryRemove} onClick={() => onRemove(entry)} aria-label={`Retirer ${entry.title} de l’historique`}>
        <X size={15} />
      </button>
    </li>
  );
}
