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

  const fetchData = async () => {
    try {
      setLoading(true);
      const [artistRes, discoRes] = await Promise.all([
        fetch(`/api/artists/${id}`),
        fetch(`/api/artists/${id}/discography`)
      ]);
      
      const artistData = await artistRes.json();
      const discoData = await discoRes.json();
      
      setArtist(artistData);
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

  const handleSync = async (types?: string[]) => {
    try {
      setSyncing(true);
      showToast(`Démarrage de la mise à jour pour ${artist?.name}...`, 'info');
      const res = await fetch(`/api/sync/artist/${id}`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types })
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
              <span>{localAlbums.length} Album{localAlbums.length > 1 ? 's' : ''} collectés</span>
              <span className={styles.badge}><Monitor size={14} /> Surveillé</span>
            </div>
          </div>
          <div className={styles.artistActions}>
            <button className={styles.iconButton}><Heart size={20} /></button>
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

      <div className={styles.columnsGrid}>
        <DiscographyColumn 
          title="Deezer" 
          icon={<Music size={20} />} 
          albums={discography.deezer.filter(a => a.name.toLowerCase().includes(filterQuery.toLowerCase()))} 
          onSearch={(a) => handleManualSearch(a.name)}
          color="#00C7F2"
          isFiltering={!!filterQuery}
        />
        <DiscographyColumn 
          title="MusicBrainz" 
          icon={<Database size={20} />} 
          albums={discography.musicbrainz.filter(a => a.name.toLowerCase().includes(filterQuery.toLowerCase()))} 
          onSearch={(a) => handleManualSearch(a.name)}
          color="#EB4C39"
          isFiltering={!!filterQuery}
        />
        <DiscographyColumn 
          title="Discogs" 
          icon={<Disc size={20} />} 
          albums={discography.discogs.filter(a => a.name.toLowerCase().includes(filterQuery.toLowerCase()))} 
          onSearch={(a) => handleManualSearch(a.name)}
          color="#333333"
          isFiltering={!!filterQuery}
        />
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
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h2 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)' }}>
              <AlertCircle size={24} />
              Supprimer l'artiste
            </h2>
            <p style={{ marginBottom: '24px', color: 'var(--text-muted)' }}>
              Êtes-vous sûr de vouloir supprimer <strong>{artist.name}</strong> ?
            </p>

            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', cursor: 'pointer', padding: '16px', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <input 
                type="checkbox" 
                checked={deleteWithFiles}
                onChange={(e) => setDeleteWithFiles(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--danger)' }}
              />
              <span>Supprimer les fichiers du disque</span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className={`${styles.button} ${styles.outlineButton}`} onClick={() => setIsDeleteModalOpen(false)}>Annuler</button>
              <button className={styles.button} onClick={handleDelete} disabled={deleting} style={{ backgroundColor: 'var(--danger)' }}>
                {deleting ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
