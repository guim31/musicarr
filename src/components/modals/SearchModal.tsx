'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Search, 
  Download, 
  RefreshCw, 
  CheckCircle2, 
  XCircle,
  HardDrive,
  FileAudio,
  Activity,
  ChevronRight,
  ShieldCheck, 
  Disc
} from 'lucide-react';
import styles from './SearchModal.module.css';
import { useToast } from '@/context/ToastContext';

interface SearchResult {
  title: string;
  indexer: string;
  size: number;
  publishDate: string;
  downloadUrl: string;
  protocol: string;
  guid: string;
  age: number;
  ageInDays: number;
  infoUrl?: string;
  isUpgrade?: boolean;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  albumId?: number;
}

export default function SearchModal({ isOpen, onClose, query, albumId }: SearchModalProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen && query) {
      handleSearch();
    }
  }, [isOpen, query]);

  const handleSearch = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const url = `/api/search/download?query=${encodeURIComponent(query)}${albumId ? `&albumId=${albumId}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Erreur lors de la recherche');
      const data = await res.json();
      setResults(data);
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (result: SearchResult) => {
    setDownloading(result.guid);
    try {
      const res = await fetch('/api/search/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: result.downloadUrl,
          title: result.title,
          protocol: result.protocol,
          albumId
        })
      });
      const data = await res.json();
      if (data.success) {
        const isDeemix = result.protocol?.toLowerCase() === 'deemix';
        const message = isDeemix 
          ? `Préparation du téléchargement : ${result.title}`
          : `Ajout à SABnzbd : ${result.title}`;
        
        // On affiche un toast de type download immédiatement avec l'ID du backend
        showToast(message, 'download', `dl-${data.activityId}`);
        onClose();
      } else {
        throw new Error(data.error || 'Erreur lors de l’envoi au client de téléchargement');
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setDownloading(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    if (mb > 1024) return (mb / 1024).toFixed(2) + ' GB';
    return mb.toFixed(1) + ' MB';
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <Search size={20} color="var(--accent)" />
            <h3>Résultats de recherche pour "{query}"</h3>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className={styles.content}>
          {status && (
            <div className={`${styles.status} ${status.type === 'success' ? styles.success : styles.error}`}>
              {status.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              {status.message}
            </div>
          )}

          {loading ? (
            <div className={styles.loading}>
              <RefreshCw className="animate-spin" size={40} color="var(--accent)" />
              <p>Recherche sur Deezer, Usenet & Torrent...</p>
            </div>
          ) : results.length === 0 ? (
            <div className={styles.noResults}>
              <Activity size={48} strokeWidth={1} />
              <p>Aucun résultat trouvé pour cette recherche.</p>
              <button className={styles.retryBtn} onClick={handleSearch}>Réessayer</button>
            </div>
          ) : (
            <div className={styles.resultsList}>
              {results.map((res) => (
                <div key={res.guid} className={styles.resultItem}>
                  <div className={styles.resultMain}>
                    <div className={styles.resultHeader}>
                      <span className={styles.protocolBadge} data-protocol={res.protocol.toLowerCase()}>
                        {res.protocol === 'deemix' ? 'DEEZER' : res.protocol}
                      </span>
                      <span className={styles.indexerName}>{res.indexer}</span>
                      {res.protocol !== 'deemix' && <span className={styles.ageBadge}>{res.ageInDays}j</span>}
                    </div>
                    <h4 className={styles.resultTitle} title={res.title}>{res.title}</h4>
                    <div className={styles.resultMeta}>
                      <span className={styles.metaItem}>
                        <HardDrive size={14} />
                        {formatSize(res.size)}
                      </span>
                      {res.isUpgrade && (
                        <span className={`${styles.metaItem} ${styles.upgradeBadge}`}>
                          <RefreshCw size={14} className="animate-spin-slow" />
                          Mise à niveau
                        </span>
                      )}
                    </div>
                  </div>
                  <button 
                    className={`${styles.downloadBtn} ${res.isUpgrade ? styles.upgradeBtn : ''}`} 
                    onClick={() => handleDownload(res)}
                    disabled={downloading === res.guid}
                  >
                    {downloading === res.guid ? (
                      <RefreshCw size={18} className="animate-spin" />
                    ) : (
                      <>
                        <Download size={18} />
                        <span>Télécharger</span>
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
