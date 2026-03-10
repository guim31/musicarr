'use client';

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Disc, 
  Music, 
  Clock, 
  Database, 
  FileAudio, 
  CheckCircle2, 
  AlertCircle,
  Monitor,
  Heart,
  RefreshCw,
  Search
} from 'lucide-react';
import Link from 'next/link';
import styles from './ArtistDetail.module.css';
import SearchModal from '@/components/modals/SearchModal';
import { useToast } from '@/context/ToastContext';

export default function ArtistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const [artist, setArtist] = useState<any>(null);
  const [albums, setAlbums] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const { showToast } = useToast();

  // Modal search state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAlbumId, setActiveAlbumId] = useState<number | undefined>();

  const fetchData = async () => {
    try {
      setLoading(true);
      const [artistRes, albumsRes] = await Promise.all([
        fetch(`/api/artists/${id}`),
        fetch(`/api/artists/${id}/albums`)
      ]);
      
      const artistData = await artistRes.json();
      const albumsData = await albumsRes.json();
      
      setArtist(artistData);
      setAlbums(albumsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      const res = await fetch(`/api/sync/artist/${id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('Discographie actualisée !', 'success');
        await fetchData(); // Refresh list
      }
    } catch (err) {
      showToast('Erreur lors de la synchronisation.', 'error');
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleManualSearch = (albumId?: number, albumName?: string) => {
    setSearchQuery(albumName ? `${artist?.name} ${albumName}` : artist?.name || '');
    setActiveAlbumId(albumId);
    setIsModalOpen(true);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
        <Music className="animate-pulse" size={48} color="var(--accent)" />
      </div>
    );
  }

  if (!artist) {
    return (
      <div style={{ textAlign: 'center', padding: '100px' }}>
        <AlertCircle size={48} color="var(--danger)" />
        <h2 style={{ marginTop: '16px' }}>Artiste non trouvé</h2>
        <Link href="/library" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Retour à la collection</Link>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Link href="/library" className={styles.backLink}>
        <ArrowLeft size={18} />
        Retour à la collection
      </Link>

      <header className={styles.header}>
        <div className={styles.artistHeader}>
          <div className={styles.artistAvatar}>
            <Music size={64} strokeWidth={1} />
          </div>
          <div className={styles.artistInfo}>
            <h1>{artist.name}</h1>
            <div className={styles.artistMeta}>
              <span>{albums.length} Album{albums.length > 1 ? 's' : ''}</span>
              <span className={styles.badge}><Monitor size={14} /> Surveillé</span>
            </div>
          </div>
          <div className={styles.artistActions}>
            <button className={styles.iconButton}><Heart size={20} /></button>
            <button 
              className={`${styles.button} ${styles.outlineButton}`} 
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Synchronisation...' : 'Actualiser discographie'}
            </button>
            <button className={styles.button} onClick={() => handleManualSearch()}>
              <Search size={18} />
              Tout rechercher
            </button>
          </div>
        </div>
      </header>

      <section className={styles.albumsSection}>
        <div style={{ padding: '0 0 24px 0', borderBottom: '1px solid var(--border)', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '1.25rem' }}>Albums</h2>
        </div>

        <div className={styles.albumsGrid}>
          {albums.map((album) => (
            <div key={album.id} className={styles.albumCardWrapper}>
              <Link href={`/library/album/${album.id}`} className={styles.albumCardLink}>
                <div className={`${styles.albumCard} ${album.status !== 'downloaded' ? styles.missingAlbum : ''}`}>
                  <div className={styles.albumCover}>
                    <img 
                      src={`/api/albums/${album.id}/cover`} 
                      alt={album.name} 
                      onError={(e: any) => {
                        e.target.style.display = 'none';
                      }}
                    />
                    <div className={styles.coverOverlay}>
                      <Disc size={48} strokeWidth={1} />
                    </div>
                  </div>
                  <div className={styles.albumInfo}>
                    <h3 title={album.name}>{album.name}</h3>
                    <div className={styles.albumMeta}>
                      <span>{album.release_date || 'Année inconnue'}</span>
                      <span className={styles.qualityBadge}>{album.quality || 'N/A'}</span>
                    </div>
                    <div className={styles.tagList}>
                      {album.metadata?.bitrate && <span>{album.metadata.bitrate} kbps</span>}
                      {album.metadata?.sampleRate && <span>{album.metadata.sampleRate / 1000} kHz</span>}
                      {album.metadata?.genre && <span>{album.metadata.genre}</span>}
                    </div>
                    <div className={styles.albumStatus}>
                      {album.status === 'downloaded' ? (
                        <span className={styles.downloaded}><CheckCircle2 size={14} /> Collecté</span>
                      ) : (
                        <span className={styles.missing}><Clock size={14} /> Manquant</span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
              {album.status !== 'downloaded' && (
                <button 
                  className={styles.searchQuickBtn}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleManualSearch(album.id, album.name);
                  }}
                  title="Rechercher cet album"
                >
                  <Search size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <SearchModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        query={searchQuery}
        albumId={activeAlbumId}
      />
    </div>
  );
}
