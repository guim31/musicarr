'use client';

import React, { useState } from 'react';
import { Search as SearchIcon, Download, Loader2, AlertCircle, ExternalLink, HardDrive } from 'lucide-react';
import styles from './Search.module.css';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [downloadingItems, setDownloadingItems] = useState<Record<string, boolean>>({});

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur lors de la recherche');
      }
      const data = await res.json();
      setResults(data);
      setHasSearched(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleDownload = async (result: any) => {
    if (result.protocol === 'torrent') {
      alert("Le téléchargement de torrents n'est pas encore supporté par Musicarr.");
      return;
    }

    const itemId = result.guid || result.title;
    setDownloadingItems(prev => ({ ...prev, [itemId]: true }));
    setError(null);

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: result.downloadUrl, 
          title: result.title, 
          protocol: result.protocol 
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors du téléchargement');
      }
      
      const message = result.protocol === 'deemix' 
        ? `🎵 Téléchargement depuis Deezer démarré pour :\n${result.title}`
        : `✅ Ajouté à SABnzbd avec succès :\n${result.title}`;
        
      alert(message);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setDownloadingItems(prev => ({ ...prev, [itemId]: false }));
    }
  };

  return (
    <div>
      <header style={{ marginBottom: '32px' }}>
        <h1>Recherche Musicale</h1>
        <p style={{ color: 'var(--text-muted)' }}>Explorez vos indexeurs pour trouver de nouvelles pépites.</p>
      </header>

      <form className={styles.searchHeader} onSubmit={handleSearch}>
        <div className={styles.searchInputWrapper}>
          <SearchIcon className={styles.searchIcon} size={20} />
          <input 
            type="text" 
            className={styles.searchInput} 
            placeholder="Artiste, album ou titre..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button 
          type="submit" 
          className={styles.downloadButton}
          style={{ width: 'auto', padding: '0 24px', height: '48px' }}
          disabled={searching}
        >
          {searching ? <Loader2 size={20} className="animate-spin" /> : <SearchIcon size={20} />}
          <span style={{ marginLeft: '8px' }}>{searching ? 'Recherche...' : 'Rechercher'}</span>
        </button>
      </form>

      {error && (
        <div style={{ 
          padding: '16px', 
          backgroundColor: 'rgba(239, 68, 68, 0.1)', 
          color: 'var(--danger)', 
          borderRadius: 'var(--radius)',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          border: '1px solid rgba(239, 68, 68, 0.2)'
        }}>
          <AlertCircle size={20} />
          {error.includes('configuré') ? (
            <span>Prowlarr n&apos;est pas configuré. <a href="/settings" style={{ textDecoration: 'underline', fontWeight: 600 }}>Allez dans les réglages</a>.</span>
          ) : error}
        </div>
      )}

      {results.length > 0 ? (
        <div className={styles.resultsTableWrapper}>
          <table className={styles.resultsTable}>
            <thead>
              <tr>
                <th>Titre / Release</th>
                <th>Indexer</th>
                <th>Type</th>
                <th>Taille</th>
                <th>Qualité</th>
                <th style={{ textAlign: 'center' }}>S/P</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result, i) => (
                <tr key={result.guid || i}>
                  <td className={styles.titleCell} style={{ maxWidth: '400px' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={result.title}>
                      {result.title}
                    </div>
                  </td>
                  <td className={styles.indexerBadge}>{result.indexer}</td>
                  <td>
                    <span style={{ 
                      fontSize: '0.7rem', 
                      padding: '2px 6px', 
                      borderRadius: '4px', 
                      backgroundColor: result.protocol === 'usenet' ? 'rgba(59, 130, 246, 0.1)' : 
                                      result.protocol === 'deemix' ? 'rgba(168, 85, 247, 0.1)' : 'rgba(234, 179, 8, 0.1)',
                      color: result.protocol === 'usenet' ? '#60a5fa' : 
                             result.protocol === 'deemix' ? '#a855f7' : '#facc15',
                      fontWeight: 600,
                      textTransform: 'uppercase'
                    }}>
                      {result.protocol === 'usenet' ? 'NZB' : 
                       result.protocol === 'deemix' ? 'DEEZER' : 'Torrent'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{result.size}</td>
                  <td>
                    <span className={`${styles.qualityBadge} ${result.quality === 'FLAC' ? styles.flacBadge : styles.mp3Badge}`}>
                      {result.quality}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {result.seeders !== undefined && (
                      <span className={styles.seeders}>{result.seeders}</span>
                    )}
                    <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>/</span>
                    <span style={{ color: 'var(--text-muted)' }}>{result.peers || 0}</span>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      {result.infoUrl && (
                        <a 
                          href={result.infoUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className={styles.iconButton}
                          title="Voir la source"
                        >
                          <ExternalLink size={16} />
                        </a>
                      )}
                      <button 
                        onClick={() => handleDownload(result)}
                        className={styles.downloadButton}
                        title={result.protocol === 'torrent' ? "Non supporté" : (result.protocol === 'deemix' ? "Télécharger via Deemix" : "Télécharger via SABnzbd")}
                        disabled={downloadingItems[result.guid || result.title] || result.protocol === 'torrent'}
                        style={{ 
                          opacity: result.protocol === 'torrent' ? 0.5 : 1, 
                          cursor: result.protocol === 'torrent' ? 'not-allowed' : 'pointer',
                          backgroundColor: result.protocol === 'deemix' ? 'var(--accent)' : '' 
                        }}
                      >
                        {downloadingItems[result.guid || result.title] ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        {result.protocol === 'deemix' ? 'Deezer' : 'Télécharger'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !searching && !error && (
          <div style={{ 
            textAlign: 'center', 
            padding: '80px 0', 
            color: 'var(--text-muted)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px'
          }}>
            <HardDrive size={48} strokeWidth={1} />
            <p>{hasSearched ? 'Aucun résultat trouvé pour cette recherche.' : 'Lancez une recherche pour interroger vos indexeurs Prowlarr.'}</p>
          </div>
        )
      )}
    </div>
  );
}
