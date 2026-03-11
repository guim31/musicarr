'use client';

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Disc, 
  Music, 
  Database, 
  FileAudio, 
  AlertCircle,
  Monitor,
  Heart,
  RefreshCw,
  Search,
  Trash2,
  CheckCircle2,
  Clock
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

  // Delete state
  const router = useRouter();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteWithFiles, setDeleteWithFiles] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const handleDelete = async () => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/artists/${id}?deleteFiles=${deleteWithFiles}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors de la suppression');
      
      showToast('Artiste supprimé avec succès', 'success');
      router.push('/library');
    } catch (err: any) {
      showToast(err.message, 'error');
      console.error('Delete failed:', err);
      setDeleting(false);
    }
  };

  const handleScanAlbum = async (albumId: number, albumName: string) => {
    try {
      showToast(`Scan de l'album "${albumName}" en cours...`, 'info');
      const res = await fetch(`/api/albums/${albumId}/scan`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('Scan terminé !', 'success');
        await fetchData();
      }
    } catch (err) {
      showToast('Erreur lors du scan.', 'error');
    }
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
              <span>{albums.filter(a => a.status === 'downloaded').length} / {albums.length} Album{albums.length > 1 ? 's' : ''}</span>
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
            <button 
              className={styles.iconButton} 
              onClick={() => setIsDeleteModalOpen(true)}
              title="Supprimer l'artiste"
              style={{ color: 'var(--danger)', marginLeft: '8px' }}
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>
      </header>

      <section className={styles.albumsSection}>
        <div style={{ padding: '0 0 24px 0', borderBottom: '1px solid var(--border)', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '1.25rem' }}>Albums</h2>
        </div>

        <div className={styles.albumsList}>
          {albums.map((album) => (
            <div key={album.id} className={styles.albumListItemWrapper}>
              <Link href={`/library/album/${album.id}`} className={styles.albumListItemLink}>
                <div className={`${styles.albumListItem} ${album.status !== 'downloaded' ? styles.missingAlbum : ''}`}>
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
                    <div className={styles.albumMainDetails}>
                      <h3 title={album.name}>{album.name}</h3>
                      <div className={styles.albumMeta}>
                        <span>{album.release_date ? album.release_date.toString().substring(0, 4) : 'Année inconnue'}</span>
                        {album.quality && <span className={styles.qualityBadge}>{album.quality}</span>}
                      </div>
                    </div>

                    <div className={styles.albumSecondaryDetails}>
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
                </div>
              </Link>
              <div className={styles.albumActions}>
                <button 
                  className={`${styles.actionBtn} ${styles.scanQuickBtn}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleScanAlbum(album.id, album.name);
                  }}
                  title="Scanner les fichiers locaux"
                >
                  <RefreshCw size={18} />
                </button>
                <button 
                  className={`${styles.actionBtn} ${styles.searchQuickBtn}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleManualSearch(album.id, album.name);
                  }}
                  title="Rechercher / Mettre à jour cet album"
                >
                  <Search size={18} />
                </button>
              </div>
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

      {isDeleteModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h2 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)' }}>
              <AlertCircle size={24} />
              Supprimer l'artiste
            </h2>
            <p style={{ marginBottom: '24px', color: 'var(--text-muted)' }}>
              Êtes-vous sûr de vouloir supprimer <strong>{artist.name}</strong> ? Cette action est irréversible et supprimera la trace des albums depuis la base de données.
            </p>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', cursor: 'pointer', padding: '16px', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius)' }}>
              <input 
                type="checkbox" 
                checked={deleteWithFiles}
                onChange={(e) => setDeleteWithFiles(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--danger)' }}
              />
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <strong>Supprimer les fichiers associés</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Supprime définitivement les pistes audio et dossiers de cet artiste du disque dur.
                </span>
              </span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                className={`${styles.button} ${styles.outlineButton}`}
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={deleting}
              >
                Annuler
              </button>
              <button 
                className={styles.button}
                onClick={handleDelete}
                disabled={deleting}
                style={{ backgroundColor: 'var(--danger)' }}
              >
                {deleting ? 'Suppression...' : 'Oui, supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
