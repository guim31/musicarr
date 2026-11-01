'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Download, ExternalLink, RefreshCw, Search as SearchIcon } from 'lucide-react';
import Cover from '@/components/ui/Cover';
import PageHeader from '@/components/ui/PageHeader';
import { useActivity } from '@/context/ActivityContext';
import { useToast } from '@/context/ToastContext';
import { api, postJson } from '@/lib/ui/api';
import { plural } from '@/lib/ui/format';
import styles from './Search.module.css';

interface Result {
  guid?: string;
  title: string;
  indexer: string;
  size: string;
  publishDate?: string;
  downloadUrl: string;
  infoUrl?: string;
  quality: string;
  protocol: string;
  seeders?: number;
  peers?: number;
  image?: string | null;
}

const PROTOCOLS: Record<string, { label: string; tone: string }> = {
  deemix: { label: 'Deezer', tone: 'sticker-flac' },
  usenet: { label: 'Usenet', tone: 'sticker-aqua' },
  torrent: { label: 'Torrent', tone: 'sticker-flat' },
};

export default function SearchPage() {
  const { showToast } = useToast();
  const { refresh } = useActivity();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<string>('all');
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true);
    setError(null);
    try {
      const data = await api<Result[]>(`/api/search?q=${encodeURIComponent(trimmed)}`);
      setResults(data);
      setSubmitted(trimmed);
      setProtocol('all');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const handleDownload = async (result: Result) => {
    const key = result.guid || result.title;
    setDownloading(current => ({ ...current, [key]: true }));
    try {
      await postJson('/api/download', { url: result.downloadUrl, title: result.title, protocol: result.protocol });
      showToast(result.title.replace(/^\[Deezer\]\s*/, ''), 'info', result.protocol === 'deemix' ? 'Téléchargement lancé' : 'Envoyé à SABnzbd');
      refresh();
    } catch (cause) {
      showToast((cause as Error).message, 'error');
    } finally {
      setDownloading(current => ({ ...current, [key]: false }));
    }
  };

  const available = useMemo(() => {
    const counts = new Map<string, number>();
    for (const result of results) counts.set(result.protocol, (counts.get(result.protocol) ?? 0) + 1);
    return [...counts.entries()];
  }, [results]);

  const visible = protocol === 'all' ? results : results.filter(result => result.protocol === protocol);

  return (
    <div className="page">
      <PageHeader mark="Face A · Piste 3" title="Recherche" subtitle="Deezer et vos indexeurs, d’un seul coup." />

      <form className={styles.form} onSubmit={handleSearch} role="search">
        <div className={styles.field}>
          <SearchIcon size={20} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Artiste, album, titre…"
            aria-label="Rechercher"
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={searching || !query.trim()}>
          {searching ? <RefreshCw size={18} className="spin" /> : <SearchIcon size={18} />}
          {searching ? 'On fouille…' : 'Chercher'}
        </button>
      </form>

      {error && (
        <div className={`notice notice-bad ${styles.notice}`}>
          <AlertTriangle size={18} />
          {error.includes('configuré') ? (
            <span>
              Prowlarr n'est pas configuré : <Link href="/settings">allez dans les réglages</Link>.
            </span>
          ) : (
            <span>{error}</span>
          )}
        </div>
      )}

      {results.length > 0 && (
        <>
          <div className={styles.summary}>
            <p className={`mono ${styles.count}`}>
              {plural(results.length, 'résultat')} pour « {submitted} »
            </p>
            <div className="chips" role="group" aria-label="Filtrer par origine">
              <button type="button" className="chip" aria-pressed={protocol === 'all'} onClick={() => setProtocol('all')}>
                Tout <small>{results.length}</small>
              </button>
              {available.map(([key, count]) => (
                <button key={key} type="button" className="chip" aria-pressed={protocol === key} onClick={() => setProtocol(key)}>
                  {PROTOCOLS[key]?.label ?? key} <small>{count}</small>
                </button>
              ))}
            </div>
          </div>

          <ul className={styles.results}>
            {visible.map((result, index) => {
              const key = result.guid || result.title;
              const origin = PROTOCOLS[result.protocol] ?? { label: result.protocol, tone: 'sticker-flat' };
              const torrent = result.protocol === 'torrent';
              const title = result.title.replace(/^\[Deezer\]\s*/, '');
              return (
                <li key={`${key}-${index}`} className={styles.result}>
                  {result.protocol === 'deemix' && <Cover src={result.image} name={title} className={styles.thumb} />}
                  <div className={styles.resultBody}>
                    <h2 className={styles.resultTitle}>{title}</h2>
                    <p className={`mono ${styles.resultMeta}`}>
                      <span className={`sticker ${origin.tone}`}>{origin.label}</span>
                      {result.indexer !== 'Deezer' && <span>{result.indexer}</span>}
                      {result.size && result.size !== 'N/A' && <span>{result.size}</span>}
                      <span className={styles.quality} data-flac={result.quality?.includes('FLAC')}>
                        {result.quality}
                      </span>
                      {result.seeders !== undefined && result.seeders !== null && <span>{result.seeders} seeds</span>}
                    </p>
                  </div>
                  <div className={styles.resultActions}>
                    {result.infoUrl && (
                      <a href={result.infoUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-icon btn-quiet" aria-label={`Voir la source de ${title}`}>
                        <ExternalLink size={16} />
                      </a>
                    )}
                    <button
                      type="button"
                      className={`btn btn-sm ${result.quality?.includes('FLAC') ? 'btn-primary' : ''}`}
                      onClick={() => handleDownload(result)}
                      disabled={downloading[key] || torrent}
                      title={torrent ? 'Aucun client torrent configuré' : undefined}
                    >
                      {downloading[key] ? <RefreshCw size={15} className="spin" /> : !torrent && <Download size={15} />}
                      {torrent ? 'Indisponible' : 'Télécharger'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {results.length === 0 && !searching && !error && (
        <div className="empty">
          <p className="hand">{submitted ? 'Chou blanc.' : 'Quel disque te manque ?'}</p>
          <p>{submitted ? `Rien trouvé pour « ${submitted} ». Essayez juste le nom de l’artiste.` : 'Un nom d’artiste ou d’album suffit.'}</p>
        </div>
      )}
    </div>
  );
}
