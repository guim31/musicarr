'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Trash2, RefreshCw, ChevronLeft, Download } from 'lucide-react';
import styles from './Debug.module.css';

export default function DebugPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      if (data.logs) {
        setLogs(data.logs);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    if (!confirm('Effacer les logs de la session ?')) return;
    try {
      await fetch('/api/logs', { method: 'DELETE' });
      setLogs([]);
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  };

  useEffect(() => {
    fetchLogs();
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(fetchLogs, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const downloadLogs = () => {
    const text = logs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `musicarr-logs-${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Debug & Logs</h1>
          <p>Visualisation des logs serveur en temps réel.</p>
        </div>
        <div className={styles.actions}>
          <div className={styles.toggleArea}>
            <label className={styles.switch}>
              <input 
                type="checkbox" 
                checked={autoRefresh} 
                onChange={(e) => setAutoRefresh(e.target.checked)} 
              />
              <span className={styles.slider}></span>
            </label>
            <span>Auto-refresh</span>
          </div>
          <button className={styles.button} onClick={fetchLogs} title="Actualiser">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className={styles.button} onClick={downloadLogs} title="Télécharger">
            <Download size={18} />
          </button>
          <button className={`${styles.button} ${styles.danger}`} onClick={clearLogs} title="Effacer">
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      <div className={styles.terminalContainer}>
        <div className={styles.terminalHeader}>
          <Terminal size={16} />
          <span>server_stdout.log</span>
        </div>
        <div className={styles.terminalContent} ref={scrollRef}>
          {logs.length === 0 && !loading && (
            <div className={styles.empty}>Aucun log capturé pour le moment.</div>
          )}
          {logs.map((log, i) => (
            <div key={i} className={styles.logEntry} data-level={log.level}>
              <span className={styles.timestamp}>
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className={styles.level}>[{log.level.toUpperCase()}]</span>
              <span className={styles.message}>{log.message}</span>
            </div>
          ))}
          {loading && logs.length === 0 && (
            <div className={styles.loading}>Chargement des logs...</div>
          )}
        </div>
      </div>
    </div>
  );
}
