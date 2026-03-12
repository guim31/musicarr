'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Filter, 
  Music, 
  Disc, 
  ArrowRight, 
  ExternalLink, 
  ChevronRight,
  Monitor,
  RefreshCw,
  CheckCircle2,
  Clock,
  LayoutGrid,
  List
} from 'lucide-react';
import Link from 'next/link';
import styles from './Library.module.css';

export default function AlbumsPage() {
  const [albums, setAlbums] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid'); // Default to grid for 'jukebox' feel

  useEffect(() => {
    fetchAlbums();
  }, []);

  const fetchAlbums = async () => {
    try {
      const res = await fetch('/api/albums');
      const data = await res.json();
      setAlbums(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredAlbums = albums.filter(a => 
    a.name.toLowerCase().includes(filter.toLowerCase()) ||
    (a.album_artist || a.artist_name || '').toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Ma Collection</h1>
          <p style={{ color: 'var(--text-muted)' }}>Gérez vos artistes et albums favoris.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link href="/library/add" style={{ textDecoration: 'none' }}>
            <button className={styles.button}>
              <Plus size={20} />
              Ajouter un artiste
            </button>
          </Link>
        </div>
      </header>

      {/* TABS NAVIGATION */}
      <div style={{ display: 'flex', gap: '24px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        <div style={{ 
          padding: '8px 16px', 
          color: 'var(--accent)', 
          fontWeight: 600, 
          cursor: 'pointer',
          borderBottom: '2px solid var(--accent)'
        }}>
          Albums
        </div>
        <Link href="/library/artists" style={{ textDecoration: 'none' }}>
          <div style={{ 
            padding: '8px 16px', 
            color: 'var(--text-muted)', 
            fontWeight: 600, 
            cursor: 'pointer',
            borderBottom: '2px solid transparent'
          }}>
            Artistes
          </div>
        </Link>
      </div>

      <div className={styles.searchHeader}>
        <div className={styles.searchInputWrapper}>
          <Search size={18} className={styles.searchIcon} />
          <input 
            type="text" 
            placeholder="Rechercher un album ou artiste de l'album..." 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '4px', backgroundColor: 'var(--background)' }}>
          <button 
             onClick={() => setViewMode('grid')}
             className={styles.outlineButton}
             style={{ 
               padding: '6px', 
               border: 'none',
               backgroundColor: viewMode === 'grid' ? 'var(--accent)' : 'transparent',
               color: viewMode === 'grid' ? 'white' : 'var(--text-muted)'
             }}
             title="Vue Jukebox"
          >
            <LayoutGrid size={18} />
          </button>
          <button 
             onClick={() => setViewMode('list')}
             className={styles.outlineButton}
             style={{ 
               padding: '6px', 
               border: 'none',
               backgroundColor: viewMode === 'list' ? 'var(--accent)' : 'transparent',
               color: viewMode === 'list' ? 'white' : 'var(--text-muted)'
             }}
             title="Vue Liste"
          >
            <List size={18} />
          </button>
        </div>
        <button className={`${styles.button} ${styles.outlineButton}`}>
          <Filter size={18} />
          Filtres
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
          <Disc className="animate-pulse" size={48} color="var(--accent)" />
        </div>
      ) : filteredAlbums.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '120px 0', 
          color: 'var(--text-muted)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px'
        }}>
          <Disc size={64} strokeWidth={1} />
          <div>
            <h2 style={{ color: 'var(--foreground)', marginBottom: '8px' }}>Aucun album trouvé</h2>
            <p>Ajustez votre recherche ou scannez votre bibliothèque.</p>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className={styles.albumGrid}>
          {filteredAlbums.map((album) => (
            <Link 
              key={album.id} 
              href={`/library/album/${album.id}`}
              className={styles.albumCard}
            >
              <div className={styles.coverWrapper}>
                 <div className={styles.coverImage} style={{ backgroundImage: `url(/api/albums/${album.id}/cover)` }}>
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
                    <span>{album.release_date || '-'}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                       {album.track_count} <Music size={12} />
                    </span>
                 </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Album</th>
                <th>Artiste de l'album</th>
                <th style={{ textAlign: 'center' }}>Année</th>
                <th>Format</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlbums.map((album) => (
                <tr key={album.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ 
                        width: '40px', 
                        height: '40px', 
                        borderRadius: '4px', 
                        backgroundColor: 'var(--background)',
                        backgroundImage: `url(/api/albums/${album.id}/cover)`,
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
                    <div className={`${styles.statusBadge} ${album.status === 'downloaded' ? styles.downloadedBadge : ''}`}>
                      {album.status === 'downloaded' ? 'Collecté' : 'Manquant'}
                    </div>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <Link href={`/library/album/${album.id}`}>
                        <button className={`${styles.button} ${styles.outlineButton}`} style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                          Ouvrir
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
      )}
    </div>
  );
}
