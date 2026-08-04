'use client';

import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  History, 
  RefreshCw, 
  Trash2, 
  Download, 
  Search, 
  CheckCircle2, 
  XCircle,
  Clock,
  ArrowRight,
  Database,
  Move,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import styles from './Activity.module.css';
import { useToast } from '@/context/ToastContext';

export default function ActivityPage() {
  const [active, setActive] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const { showToast } = useToast();

  const fetchActivity = async (showLoading = true, targetPage = page) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch(`/api/activity?page=${targetPage}&pageSize=${pageSize}`);
      const data = await res.json();
      setActive(data.active || []);
      setHistory(data.history || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to fetch activity:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivity(true, page);
    // Poll only for ACTIVE section if we are on page 1 of history, otherwise we might 
    // keep refreshing history while someone is looking at old logs.
    // Actually, it's simpler to poll everything but only show loading on first fetch.
    const interval = setInterval(() => fetchActivity(false, page), 3000);
    return () => clearInterval(interval);
  }, [page]);

  const handleClearHistory = async () => {
    if (!confirm('Voulez-vous vraiment effacer tout l\'historique ?')) return;
    try {
      const res = await fetch('/api/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_history' })
      });
      if (res.ok) {
        showToast('Historique effacé.', 'success');
        setPage(1);
        fetchActivity(true, 1);
      }
    } catch (err) {
      showToast('Erreur lors de l\'effacement.', 'error');
    }
  };

  const handleDeleteActivity = async (id: string) => {
    if (!confirm('Voulez-vous supprimer cette activité ?')) return;
    try {
      const numericId = id.startsWith('local-') ? id.replace('local-', '') : id;
      const res = await fetch('/api/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_history', id: numericId })
      });
      if (res.ok) {
        showToast('Activité supprimée.', 'success');
        fetchActivity(false);
      }
    } catch (err) {
      showToast('Erreur lors de la suppression.', 'error');
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'download': return <Download size={18} />;
      case 'scan': return <Database size={18} />;
      case 'sync': return <RefreshCw size={18} />;
      case 'move': return <Move size={18} />;
      default: return <Activity size={18} />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 size={16} color="var(--success)" />;
      case 'failed': return <XCircle size={16} color="var(--danger)" />;
      case 'downloading': return <RefreshCw size={16} className="animate-spin" color="var(--accent)" />;
      default: return <Clock size={16} color="var(--text-muted)" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Terminé';
      case 'failed': return 'Échec';
      case 'downloading': return 'En cours';
      case 'pending': return 'En attente';
      default: return status;
    }
  };

  if (loading && history.length === 0) {
    return (
      <div className={styles.loading}>
        <RefreshCw className="animate-spin" size={48} color="var(--accent)" />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Activité</h1>
          <p>Suivez les téléchargements et les opérations en cours.</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.button} onClick={handleClearHistory}>
            <Trash2 size={18} />
            Effacer l'historique
          </button>
        </div>
      </header>

      {/* ACTIVE SECTION */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <Activity size={20} color="var(--accent)" />
          <h2>En cours</h2>
          {active.length > 0 && <span className={styles.activeBadge}>{active.length}</span>}
        </div>
        
        {active.length === 0 ? (
          <div className={styles.emptyState}>
            <p>Aucun téléchargement actif.</p>
          </div>
        ) : (
          <div className={styles.activeGrid}>
            {active.map((item) => {
              const details = JSON.parse(item.details || '{}');
              const isDeemix = item.id.startsWith('local-') && item.type === 'download';
              
              let progressPercent = 0;
              let statusLabel = "";
              
              if (isDeemix) {
                progressPercent = details.total > 0 ? (details.current / details.total) * 100 : 0;
                statusLabel = `${details.current} / ${details.total} titres`;
              } else if (item.type === 'sync') {
                progressPercent = details.progress || 0;
                statusLabel = details.provider ? `${details.provider} : ${details.current || 0} / ${details.total || '?'}` : item.message;
              } else {
                progressPercent = details.percentage || 0;
                statusLabel = `${details.speed || '0 KB/s'} / ${details.timeleft || 'calcul...'}`;
              }

              return (
                <div key={item.id} className={styles.activeCard} data-type={isDeemix ? 'deemix' : 'sabnzbd'}>
                  <div className={styles.activeHeader}>
                    <Download size={20} color={isDeemix ? "#a238ff" : "var(--accent)"} />
                    <div className={styles.activeTitle}>
                      <h4 title={item.title}>{item.title}</h4>
                      <span>{statusLabel}</span>
                    </div>
                    <button 
                      className={styles.deleteBtn}
                      onClick={() => handleDeleteActivity(item.id)}
                      title="Supprimer l'activité"
                    >
                      <XCircle size={16} />
                    </button>
                  </div>
                  <div className={styles.progressArea}>
                    <div className={styles.progressBar}>
                      <div 
                        className={styles.progressFill} 
                        style={{ 
                          width: `${progressPercent}%`,
                          background: isDeemix ? 'linear-gradient(90deg, #a238ff, #ff3bce)' : 'var(--accent)'
                        }}
                      ></div>
                    </div>
                    <div className={styles.progressLabels}>
                      <span>{Math.round(progressPercent)}%</span>
                      {!isDeemix && <span>{details.mbleft} MB restants</span>}
                      {isDeemix && <span>Titre en cours...</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* HISTORY SECTION */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <History size={20} color="var(--accent)" />
          <h2>Historique récent</h2>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Opération</th>
                <th>Message</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id}>
                  <td className={styles.typeCell}>
                    <div className={styles.iconBox} data-type={entry.type}>
                      {getIcon(entry.type)}
                    </div>
                  </td>
                  <td className={styles.titleCell}>
                    <div className={styles.titleContent}>
                      <span className={styles.operationTitle}>{entry.title}</span>
                      {entry.artist_name && <span className={styles.subtext}>{entry.artist_name}</span>}
                    </div>
                  </td>
                  <td className={styles.messageCell}>
                    <p title={entry.message}>{entry.message}</p>
                  </td>
                  <td className={styles.dateCell}>
                    {new Date(entry.timestamp).toLocaleString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>
                  <td className={styles.statusCell}>
                    <div className={styles.statusBox}>
                      {getStatusIcon(entry.status)}
                      <span>{getStatusLabel(entry.status)}</span>
                    </div>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.emptyTable}>Aucun historique pour le moment.</td>
                </tr>
              )}
            </tbody>
          </table>
          
          {history.length > 0 && (
            <div className={styles.pagination}>
              <button
                className={styles.paginationBtn}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Page précédente"
              >
                <ChevronLeft size={20} />
              </button>
              
              <div className={styles.pageInfo}>
                Page <strong>{page}</strong> sur <strong>{Math.ceil(total / pageSize) || 1}</strong>
                <span className={styles.totalCount}> ({total} opérations)</span>
              </div>

              <button
                className={styles.paginationBtn}
                onClick={() => setPage(p => p + 1)}
                disabled={page >= Math.ceil(total / pageSize)}
                aria-label="Page suivante"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
