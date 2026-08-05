'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Plus,
  Music,
  Disc, 
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  LayoutGrid,
  List,
  ArrowUpDown,
  SortAsc,
  SortDesc,
  Calendar,
  Type,
  User
} from 'lucide-react';
import Link from 'next/link';
import styles from './Library.module.css';

export default function AlbumsPage() {
  const [albums, setAlbums] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  
  // Pagination & Sorting states
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(40);
  const [sortBy, setSortBy] = useState('date');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const fetchAlbums = useCallback(async (isSearch = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: (isSearch ? 1 : page).toString(),
        limit: limit.toString(),
        sortBy,
        order,
        search: filter
      });
      const res = await fetch(`/api/albums?${params.toString()}`);
      const data = await res.json();
      setAlbums(data.albums || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 0);
      if (isSearch) setPage(1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, sortBy, order, filter]);

  // Initial fetch and on param changes (except search which has its own effect)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAlbums();
    }, 50); // Small tiny delay to avoid double trigger on mount
    return () => clearTimeout(timer);
  }, [page, limit, sortBy, order]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAlbums(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [filter]);

  // Écouter les événements de fin d'activité pour rafraîchir la liste
  useEffect(() => {
    const handleRefresh = () => {
      console.log('[Library] Activity finished, refreshing list...');
      fetchAlbums();
    };

    window.addEventListener('musicarr:activity-finished', handleRefresh);
    return () => window.removeEventListener('musicarr:activity-finished', handleRefresh);
  }, [fetchAlbums]);

  const handleSortChange = (newSortBy: string) => {
    if (sortBy === newSortBy) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setOrder(newSortBy === 'date' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return (
      <div className={styles.pagination}>
        <button 
          onClick={() => setPage(1)} 
          disabled={page === 1}
          className={styles.pageButton}
          title="Première page"
        >
          <ChevronsLeft size={16} />
        </button>
        <button 
          onClick={() => setPage(prev => Math.max(1, prev - 1))} 
          disabled={page === 1}
          className={styles.pageButton}
          title="Page précédente"
        >
          <ChevronLeft size={16} />
        </button>

        {start > 1 && <span style={{ color: 'var(--text-muted)' }}>...</span>}

        {pages.map(p => (
          <button
            key={p}
            onClick={() => setPage(p)}
            className={`${styles.pageButton} ${page === p ? styles.pageButtonActive : ''}`}
          >
            {p}
          </button>
        ))}

        {end < totalPages && <span style={{ color: 'var(--text-muted)' }}>...</span>}

        <button 
          onClick={() => setPage(prev => Math.min(totalPages, prev + 1))} 
          disabled={page === totalPages}
          className={styles.pageButton}
          title="Page suivante"
        >
          <ChevronRight size={16} />
        </button>
        <button 
          onClick={() => setPage(totalPages)} 
          disabled={page === totalPages}
          className={styles.pageButton}
          title="Dernière page"
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Ma Collection</h1>
          <p style={{ color: 'var(--text-muted)' }}>Gérez vos artistes et albums favoris.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link href="/library/add" className={styles.button}>
            <Plus size={20} />
            Ajouter un artiste
          </Link>
        </div>
      </header>

      {/* TABS NAVIGATION */}
      <nav className={styles.tabs} aria-label="Sections de la collection">
        <span className={`${styles.tab} ${styles.tabActive}`} aria-current="page">
          Albums
        </span>
        <Link href="/library/artists" className={styles.tab}>
          Artistes
        </Link>
      </nav>

      <div className={styles.searchHeader}>
        <div className={styles.searchInputWrapper}>
          <Search size={18} className={styles.searchIcon} />
          <input 
            type="text" 
            placeholder="Rechercher un album ou artiste..." 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <div className={styles.viewToggle} role="group" aria-label="Mode d'affichage">
          <button
             onClick={() => setViewMode('grid')}
             className={`${styles.viewToggleButton} ${viewMode === 'grid' ? styles.viewToggleActive : ''}`}
             title="Vue grille"
             aria-pressed={viewMode === 'grid'}
          >
            <LayoutGrid size={18} />
          </button>
          <button
             onClick={() => setViewMode('list')}
             className={`${styles.viewToggleButton} ${viewMode === 'list' ? styles.viewToggleActive : ''}`}
             title="Vue liste"
             aria-pressed={viewMode === 'list'}
          >
            <List size={18} />
          </button>
        </div>
      </div>

      <div className={styles.controlsRow}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <div className={styles.selectWrapper}>
            <ArrowUpDown size={14} />
            <select 
              className={styles.select} 
              value={sortBy} 
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
            >
              <option value="date">Date d'ajout</option>
              <option value="title">Titre</option>
              <option value="artist">Artiste</option>
            </select>
          </div>
          <div className={styles.selectWrapper}>
            {order === 'asc' ? <SortAsc size={14} /> : <SortDesc size={14} />}
            <select 
              className={styles.select} 
              value={order} 
              onChange={(e) => {
                setOrder(e.target.value as 'asc' | 'desc');
                setPage(1);
              }}
            >
              <option value="desc">Décroissant</option>
              <option value="asc">Croissant</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {total} album{total > 1 ? 's' : ''}
          </div>
          <div className={styles.selectWrapper}>
            <span style={{ fontSize: '0.85rem' }}>Afficher :</span>
            <select 
              className={styles.select} 
              value={limit} 
              onChange={(e) => {
                setLimit(parseInt(e.target.value));
                setPage(1);
              }}
            >
              <option value="20">20</option>
              <option value="40">40</option>
              <option value="100">100</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className={styles.loadingState}>
          <Disc className={styles.spin} size={48} color="var(--accent)" />
          <p>Chargement de votre collection...</p>
        </div>
      ) : albums.length === 0 ? (
        <div className={styles.emptyState}>
          <Disc size={64} strokeWidth={1} />
          <div>
            <h2>Aucun album trouvé</h2>
            <p>
              {filter
                ? 'Aucun résultat pour cette recherche. Essayez d\'autres mots-clés.'
                : 'Ajoutez un artiste ou scannez votre bibliothèque pour commencer.'}
            </p>
          </div>
          {!filter && (
            <Link href="/library/add" className={styles.button}>
              <Plus size={18} />
              Ajouter un artiste
            </Link>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <>
          <div className={styles.albumGrid}>
            {albums.map((album) => (
              <Link 
                key={album.id} 
                href={`/library/album/${album.id}`}
                className={styles.albumCard}
              >
                <div className={styles.coverWrapper}>
                  <div className={styles.coverImage} style={{ backgroundImage: `url(/api/albums/${album.id}/cover?v=${new Date(album.release_date).getTime()})` }}>
                      {!album.metadata?.includes('hasCover":true') && !album.path && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                            <Disc size={40} color="var(--text-muted)" opacity={0.3} />
                        </div>
                      )}
                  </div>
                  {album.quality && album.quality !== 'Unknown' && (
                      <div className={styles.qualityBadge}>{album.quality}</div>
                  )}
                </div>
                <div className={styles.albumInfo}>
                  <div className={styles.albumCardTitle}>{album.name}</div>
                  <div className={styles.albumCardArtist}>{album.album_artist || album.artist_name}</div>
                  <div className={styles.albumCardMeta}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={12} />
                        {album.release_date || '-'}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {album.track_count} <Music size={12} />
                      </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {renderPagination()}
        </>
      ) : (
        <>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th onClick={() => handleSortChange('title')} style={{ cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Type size={14} />
                      Album
                      {sortBy === 'title' && (order === 'asc' ? <SortAsc size={14} /> : <SortDesc size={14} />)}
                    </div>
                  </th>
                  <th onClick={() => handleSortChange('artist')} style={{ cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <User size={14} />
                      Artiste
                      {sortBy === 'artist' && (order === 'asc' ? <SortAsc size={14} /> : <SortDesc size={14} />)}
                    </div>
                  </th>
                  <th onClick={() => handleSortChange('date')} style={{ cursor: 'pointer', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                      <Calendar size={14} />
                      Année
                      {sortBy === 'date' && (order === 'asc' ? <SortAsc size={14} /> : <SortDesc size={14} />)}
                    </div>
                  </th>
                  <th>Format</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {albums.map((album) => (
                  <tr key={album.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ 
                          width: '40px', 
                          height: '40px', 
                          borderRadius: '4px', 
                          backgroundColor: 'var(--background)',
                          backgroundImage: `url(/api/albums/${album.id}/cover?v=${new Date(album.release_date).getTime()})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          border: '1px solid var(--border)'
                        }}>
                          {!album.metadata?.includes('hasCover":true') && !album.path && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                <Disc size={20} color="var(--text-muted)" />
                            </div>
                          )}
                        </div>
                        <Link href={`/library/album/${album.id}`} className={styles.artistLink}>
                          <span className={styles.artistName}>{album.name}</span>
                        </Link>
                      </div>
                    </td>
                    <td>
                      <Link href={`/library/artist/${album.artist_id}`} style={{ textDecoration: 'none' }}>
                        <span style={{ color: 'var(--foreground)', opacity: 0.9 }}>{album.album_artist || album.artist_name}</span>
                      </Link>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{album.release_date || '-'}</span>
                    </td>
                    <td>
                      <span style={{ 
                        fontSize: '0.7rem', 
                        backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                        padding: '2px 6px', 
                        borderRadius: '4px',
                        color: 'var(--text-muted)',
                        fontWeight: 600
                      }}>
                        {album.quality || 'N/A'}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <Link href={`/library/album/${album.id}`}>
                          <button className={`${styles.button} ${styles.outlineButton}`} style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                            Détails
                            <ChevronRight size={14} />
                          </button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {renderPagination()}
        </>
      )}
    </div>
  );
}
