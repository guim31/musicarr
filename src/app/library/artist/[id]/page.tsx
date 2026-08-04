'use client';

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Disc,
  Music,
  Database,
  AlertCircle,
  Monitor,
  RefreshCw,
  Search,
  Trash2,
  Shield
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './ArtistDetail.module.css';
import DiscographyColumn from '@/components/artist/DiscographyColumn';
import SearchModal from '@/components/modals/SearchModal';
import SyncOptionsModal from '@/components/modals/SyncOptionsModal';
import { useToast } from '@/context/ToastContext';

export default function ArtistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const [artist, setArtist] = useState<any>(null);
  const [localAlbums, setLocalAlbums] = useState<any[]>([]);
  const [discography, setDiscography] = useState<Record<string, any[]>>({
    deezer: [],
    musicbrainz: [],
    discogs: []
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
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

  // Filter state
  const [filterQuery, setFilterQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'deezer' | 'musicbrainz' | 'discogs'>('deezer');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [artistRes, discoRes] = await Promise.all([
        fetch(`/api/artists/${id}`),
        fetch(`/api/artists/${id}/discography`)
      ]);
      
      const artistData = await artistRes.json();
      const discoData = await discoRes.json();

      setArtist(artistRes.ok && !artistData.error ? artistData : null);
      if (discoData.success) {
        setDiscography(discoData.discography);
        // On simule localAlbums pour les compteurs à partir du cache marqué "isOwned"
        // Ou on pourrait ajouter un endpoint spécifique pour les albums locaux filtrés par 'downloaded'
        const albumsRes = await fetch(`/api/artists/${id}/albums`);
        const albumsData = await albumsRes.json();
        setLocalAlbums(albumsData.filter((a: any) => a.status === 'downloaded'));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const handleRefresh = (event: any) => {
      fetchData();
    };

    window.addEventListener('musicarr:activity-finished', handleRefresh);
    return () => window.removeEventListener('musicarr:activity-finished', handleRefresh);
  }, [id]);

  // Fermer la modale de suppression avec Échap
  useEffect(() => {
    if (!isDeleteModalOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleting) setIsDeleteModalOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isDeleteModalOpen, deleting]);

  const handleSync = async (types?: string[], deep?: boolean) => {
    try {
      setSyncing(true);
      showToast(`Démarrage de la mise à jour pour ${artist?.name}...`, 'info');
      const res = await fetch(`/api/sync/artist/${id}`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types, deep })
      });
      const data = await res.json();
      if (data.success) {
        // Le rafraîchissement se fera via l'événement d'activité
      }
    } catch (err) {
      showToast('Erreur lors de la mise à jour.', 'error');
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  const [fixingPermissions, setFixingPermissions] = useState(false);

  const [scanning, setScanning] = useState(false);

  const handleScan = async () => {
    try {
      setScanning(true);
      showToast(`Scan des dossiers locaux pour ${artist?.name}...`, 'info');
      const res = await fetch(`/api/artists/${id}/scan`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(`Scan terminé : ${data.processed} fichiers traités.`, 'success');
        fetchData();
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      showToast(err.message || 'Erreur lors du scan local.', 'error');
    } finally {
      setScanning(false);
    }
  };

  const handleFixPermissions = async () => {
    try {
      setFixingPermissions(true);
      showToast(`Correction des permissions en cours...`, 'info');
      const res = await fetch(`/api/artists/${id}/permissions`, { 
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        showToast(`Lancement d'un scan pour intégrer les fichiers...`, 'info');
        await fetch(`/api/artists/${id}/scan`, { method: 'POST' });
        fetchData();
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      showToast(err.message || 'Erreur lors de la correction des permissions.', 'error');
    } finally {
      setFixingPermissions(false);
    }
  };

  const handleManualSearch = (albumName?: string) => {
    setSearchQuery(albumName ? `${artist?.name} ${albumName}` : artist?.name || '');
    setActiveAlbumId(undefined); // On ne lie pas à un album ID local car il n'existe peut-être pas encore
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

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <Disc className="animate-spin" size={48} color="var(--accent)" />
        <p>Chargement de l&apos;artiste...</p>
      </div>
    );
  }

  if (!artist) {
    return (
      <div className={styles.loadingState}>
        <AlertCircle size={48} color="var(--danger)" />
        <h2>Artiste non trouvé</h2>
        <Link href="/library" className={styles.backLink}>
          <ArrowLeft size={18} />
          Retour à la collection
        </Link>
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
              <span>{localAlbums.length} Album{localAlbums.length > 1 ? 's' : ''} collectés</span>
              <span className={styles.badge}><Monitor size={14} /> Surveillé</span>
            </div>
          </div>
          <div className={styles.artistActions}>
            <button
              className={`${styles.button} ${styles.outlineButton}`}
              onClick={handleScan}
              disabled={scanning}
              title="Scanner les dossiers locaux"
              aria-label="Scanner les dossiers locaux"
            >
              <Search size={18} className={scanning ? 'animate-spin' : ''} />
            </button>
            <button
              className={`${styles.button} ${styles.outlineButton}`}
              onClick={handleFixPermissions}
              disabled={fixingPermissions}
              title="Corriger les permissions"
              aria-label="Corriger les permissions"
            >
              <Shield size={18} className={fixingPermissions ? 'animate-pulse' : ''} />
            </button>
            <button 
              className={`${styles.button} ${styles.outlineButton}`} 
              onClick={() => setIsSyncModalOpen(true)}
              disabled={syncing}
            >
              <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Mise à jour...' : 'Actualiser discographie'}
            </button>
            <button
              className={`${styles.button} ${styles.dangerButton}`}
              onClick={() => setIsDeleteModalOpen(true)}
              title="Supprimer l'artiste"
              aria-label="Supprimer l'artiste"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className={styles.filterSection}>
        <div className={styles.searchBar}>
          <Search size={18} className={styles.searchIcon} />
          <input 
            type="text" 
            placeholder="Filtrer les albums, singles, EPs..." 
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className={styles.searchInput}
          />
          {filterQuery && (
            <button className={styles.clearButton} onClick={() => setFilterQuery('')}>
              Effacer
            </button>
          )}
        </div>
      </div>

      <div className={styles.mobileTabs}>
        <button 
          className={`${styles.mobileTab} ${activeTab === 'deezer' ? styles.mobileTabActive : ''}`}
          onClick={() => setActiveTab('deezer')}
        >
          Deezer ({discography.deezer.length})
        </button>
        <button 
          className={`${styles.mobileTab} ${activeTab === 'musicbrainz' ? styles.mobileTabActive : ''}`}
          onClick={() => setActiveTab('musicbrainz')}
        >
          MusicBrainz ({discography.musicbrainz.length})
        </button>
        <button 
          className={`${styles.mobileTab} ${activeTab === 'discogs' ? styles.mobileTabActive : ''}`}
          onClick={() => setActiveTab('discogs')}
        >
          Discogs ({discography.discogs.length})
        </button>
      </div>

      <div className={styles.columnsGrid}>
        <div className={activeTab !== 'deezer' ? styles.hideMobile : ''}>
          <DiscographyColumn 
            title="Deezer" 
            icon={<Music size={20} />} 
            albums={discography.deezer.filter(a => a.name.toLowerCase().includes(filterQuery.toLowerCase()))} 
            onSearch={(a) => handleManualSearch(a.name)}
            color="#00C7F2"
            isFiltering={!!filterQuery}
          />
        </div>
        <div className={activeTab !== 'musicbrainz' ? styles.hideMobile : ''}>
          <DiscographyColumn 
            title="MusicBrainz" 
            icon={<Database size={20} />} 
            albums={discography.musicbrainz.filter(a => a.name.toLowerCase().includes(filterQuery.toLowerCase()))} 
            onSearch={(a) => handleManualSearch(a.name)}
            color="#EB4C39"
            isFiltering={!!filterQuery}
          />
        </div>
        <div className={activeTab !== 'discogs' ? styles.hideMobile : ''}>
          <DiscographyColumn 
            title="Discogs" 
            icon={<Disc size={20} />} 
            albums={discography.discogs.filter(a => a.name.toLowerCase().includes(filterQuery.toLowerCase()))} 
            onSearch={(a) => handleManualSearch(a.name)}
            color="#333333"
            isFiltering={!!filterQuery}
          />
        </div>
      </div>

      <SearchModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        query={searchQuery}
        albumId={activeAlbumId}
      />

      <SyncOptionsModal 
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSync={handleSync}
        artistName={artist.name}
      />

      {isDeleteModalOpen && (
        <div
          className={styles.modalOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) setIsDeleteModalOpen(false);
          }}
        >
          <div className={styles.modalContent} role="dialog" aria-modal="true" aria-labelledby="delete-artist-title">
            <h2 id="delete-artist-title" className={styles.modalTitle}>
              <AlertCircle size={24} />
              Supprimer l&apos;artiste
            </h2>
            <p className={styles.modalText}>
              Êtes-vous sûr de vouloir supprimer <strong>{artist.name}</strong> ?
            </p>

            <label className={styles.modalCheckbox}>
              <input
                type="checkbox"
                checked={deleteWithFiles}
                onChange={(e) => setDeleteWithFiles(e.target.checked)}
              />
              <span>Supprimer les fichiers du disque</span>
            </label>

            <div className={styles.modalActions}>
              <button className={`${styles.button} ${styles.outlineButton}`} onClick={() => setIsDeleteModalOpen(false)} disabled={deleting}>
                Annuler
              </button>
              <button className={`${styles.button} ${styles.dangerButton}`} onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
