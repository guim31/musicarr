'use client';

import React, { useState } from 'react';
import { AlertTriangle, ArrowUpCircle, Download, RefreshCw } from 'lucide-react';
import Sheet from '@/components/ui/Sheet';
import { useToast } from '@/context/ToastContext';
import { useActivity } from '@/context/ActivityContext';
import { useApi } from '@/hooks/useApi';
import { postJson } from '@/lib/ui/api';
import { formatBytes } from '@/lib/ui/format';
import styles from './Modals.module.css';

interface SearchResult {
  title: string;
  indexer: string;
  size: number;
  publishDate: string;
  downloadUrl: string;
  protocol: string;
  guid: string;
  ageInDays: number;
  infoUrl?: string;
  isUpgrade?: boolean;
  qualities?: string[];
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  albumId?: number;
}

/** Un torrent n'est pas téléchargeable : Musicarr n'a pas de client torrent. */
const isTorrent = (result: SearchResult) => result.protocol?.toLowerCase() === 'torrent';

const PROTOCOLS: Record<string, { label: string; tone: string }> = {
  deemix: { label: 'Deezer', tone: 'sticker-flac' },
  usenet: { label: 'Usenet', tone: 'sticker-aqua' },
  torrent: { label: 'Torrent', tone: 'sticker-flat' },
};

export default function SearchModal({ isOpen, onClose, query, albumId }: SearchModalProps) {
  const url = isOpen && query ? `/api/search/download?query=${encodeURIComponent(query)}${albumId ? `&albumId=${albumId}` : ''}` : null;
  const { data, loading, error, reload } = useApi<SearchResult[]>(url);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const { showToast } = useToast();
  const { refresh } = useActivity();

  const handleDownload = async (result: SearchResult) => {
    setDownloading(result.guid);
    setFailure(null);
    try {
      await postJson('/api/search/download', {
        url: result.downloadUrl,
        title: result.title,
        protocol: result.protocol,
        albumId,
      });
      showToast(result.title, 'info', result.protocol?.toLowerCase() === 'deemix' ? 'Téléchargement lancé' : 'Envoyé à SABnzbd');
      refresh();
      onClose();
    } catch (cause) {
      setFailure((cause as Error).message);
    } finally {
      setDownloading(null);
    }
  };

  const results = data ?? [];

  return (
    <Sheet open={isOpen} onClose={onClose} title="Chercher ce disque" subtitle={query} size="large">
      {(failure || error) && (
        <div className="notice notice-bad">
          <AlertTriangle size={18} />
          <span>{failure || error}</span>
        </div>
      )}

      {loading ? (
        <div className="empty">
          <span className="mini-record" aria-hidden="true" />
          <p>On fouille Deezer et les indexeurs…</p>
        </div>
      ) : results.length === 0 && !error ? (
        <div className="empty">
          <p className="hand">Chou blanc.</p>
          <p>Aucune version trouvée pour cette recherche.</p>
          <button type="button" className="btn" onClick={reload}>
            <RefreshCw size={18} />
            Réessayer
          </button>
        </div>
      ) : (
        <ul className={styles.results}>
          {results.map(result => {
            const protocol = PROTOCOLS[result.protocol?.toLowerCase()] ?? { label: result.protocol, tone: 'sticker-flat' };
            return (
              <li key={result.guid} className={styles.result}>
                <div className={styles.resultHead}>
                  <span className={`sticker ${protocol.tone}`}>{protocol.label}</span>
                  <span className="mono muted clamp-1">
                    {result.indexer}
                    {result.protocol !== 'deemix' && result.ageInDays ? ` · ${result.ageInDays} j` : ''}
                  </span>
                </div>
                <h3 className={styles.resultTitle}>{result.title}</h3>
                <div className={styles.resultFoot}>
                  <span className={`mono ${styles.resultMeta}`}>
                    {formatBytes(result.size) && <span>{formatBytes(result.size)}</span>}
                    {result.qualities?.map(quality => (
                      <span key={quality} className={styles.resultQuality}>
                        {quality}
                      </span>
                    ))}
                    {result.isUpgrade && (
                      <span className={styles.resultUpgrade}>
                        <ArrowUpCircle size={13} /> Mieux
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className={`btn btn-sm ${result.isUpgrade ? 'btn-primary' : ''}`}
                    onClick={() => handleDownload(result)}
                    disabled={downloading !== null || isTorrent(result)}
                    title={isTorrent(result) ? 'Aucun client torrent configuré' : undefined}
                  >
                    {downloading === result.guid ? <RefreshCw size={15} className="spin" /> : !isTorrent(result) && <Download size={15} />}
                    {isTorrent(result) ? 'Indisponible' : 'Télécharger'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
