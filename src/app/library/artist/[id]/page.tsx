'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Disc,
  Music,
  AlertCircle,
  RefreshCw,
  Search,
  Trash2,
  Shield,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './ArtistDetail.module.css';
import DiscographyList, { type DiscographyRelease } from '@/components/artist/DiscographyList';
import SearchModal from '@/components/modals/SearchModal';
import SyncOptionsModal from '@/components/modals/SyncOptionsModal';
import { useToast } from '@/context/ToastContext';
import type { ReleaseType } from '@/services/metadata/releaseTypes';

interface ProviderState {
  provider: string;
  status: 'ok' | 'failed' | 'unmatched' | 'skipped';
  message?: string;
  count: number;
  updatedAt: string;
  scope?: { types?: string[]; deep?: boolean };
}

const PROVIDER_LABELS: Record<string, string> = {
  musicbrainz: 'MusicBrainz',
  deezer: 'Deezer',
  discogs: 'Discogs',
};

const STATUS_LABELS: Record<ProviderState['status'], string> = {
  ok: 'à jour',
  failed: 'échec',
  unmatched: 'artiste non identifié',
  skipped: 'non configuré',
};

export default function ArtistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const router = useRouter();
  const { showToast } = useToast();

  const [artist, setArtist] = useState<{ name: string } | null>(null);
  const [releases, setReleases] = useState<DiscographyRelease[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [providers, setProviders] = useState<ProviderState[]>([]);
  const [ownedCount, setOwnedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [syncing, setSyncing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [fixingPermissions, setFixingPermissions] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteWithFiles, setDeleteWithFiles] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [filterQuery, setFilterQuery] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [artistRes, discoRes] = await Promise.all([
        fetch(`/api/artists/${id}`),
        fetch(`/api/artists/${id}/discography`),
      ]);

      const artistData = await artistRes.json();
      setArtist(artistRes.ok && !artistData.error ? artistData : null);

      const discoData = await discoRes.json();
      if (discoData.success) {
        setReleases(discoData.discography);
        setCounts(discoData.counts ?? {});
        setProviders(discoData.providers ?? []);
        setOwnedCount(discoData.owned ?? 0);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
    const handleRefresh = () => fetchData();
    window.addEventListener('musicarr:activity-finished', handleRefresh);
    return () => window.removeEventListener('musicarr:activity-finished', handleRefresh);
  }, [fetchData]);

  useEffect(() => {
    if (!isDeleteModalOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleting) setIsDeleteModalOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isDeleteModalOpen, deleting]);

  const handleSync = async (types: ReleaseType[], deep: boolean) => {
    try {
      setSyncing(true);
      const res = await fetch(`/api/sync/artist/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types, deep }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Impossible de démarrer la synchronisation');
      showToast(`Mise à jour de ${artist?.name} lancée`, 'info');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleScan = async () => {
    try {
      setScanning(true);
      showToast(`Scan des dossiers locaux pour ${artist?.name}…`, 'info');
      const res = await fetch(`/api/artists/${id}/scan`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Le scan a échoué');
      showToast(`Scan terminé : ${data.processed} fichier(s) traité(s).`, 'success');
      fetchData();
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setScanning(false);
    }
  };

  const handleFixPermissions = async () => {
    try {
      setFixingPermissions(true);
      showToast('Correction des permissions en cours…', 'info');
      const res = await fetch(`/api/artists/${id}/permissions`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'La correction a échoué');
      showToast(data.message, 'success');
      await fetch(`/api/artists/${id}/scan`, { method: 'POST' });
      fetchData();
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setFixingPermissions(false);
    }
  };

  const handleSearchRelease = (release: DiscographyRelease) => {
    setSearchQuery(`${artist?.name ?? ''} ${release.name}`.trim());
    setIsModalOpen(true);
  };

  const handleToggleMonitor = async (release: DiscographyRelease) => {
    const next = !release.monitored;
    // Bascule optimiste : l'écriture est instantanée côté serveur, attendre
    // la réponse ne ferait que rendre le bouton mou.
    setReleases(current =>
      current.map(item => (item.id === release.id ? { ...item, monitored: next } : item)),
    );

    try {
      const res = await fetch(`/api/releases/${release.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monitored: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Mise à jour impossible');
    } catch (error) {
      setReleases(current =>
        current.map(item => (item.id === release.id ? { ...item, monitored: !next } : item)),
      );
      showToast((error as Error).message, 'error');
    }
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/artists/${id}?deleteFiles=${deleteWithFiles}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors de la suppression');
      showToast('Artiste supprimé', 'success');
      router.push('/library');
    } catch (error) {
      showToast((error as Error).message, 'error');
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
              <span>
                {ownedCount} / {releases.length} sortie{releases.length > 1 ? 's' : ''} en collection
              </span>
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

      {/* État de chaque source. Une colonne vide parce que le fournisseur a
          échoué n'est plus indiscernable d'une colonne vide parce qu'il n'a
          rien trouvé. */}
      {providers.length > 0 && (
        <div className={styles.sourceStrip}>
          {providers.map(provider => (
            <span
              key={provider.provider}
              className={`${styles.sourceState} ${styles[`state_${provider.status}`] ?? ''}`}
              title={provider.message}
            >
              {provider.status === 'ok' ? (
                <CheckCircle2 size={14} />
              ) : provider.status === 'failed' ? (
                <XCircle size={14} />
              ) : (
                <MinusCircle size={14} />
              )}
              <strong>{PROVIDER_LABELS[provider.provider] ?? provider.provider}</strong>
              <span>{STATUS_LABELS[provider.status]}</span>
              {provider.status === 'ok' && <span>· {provider.count} sorties</span>}
              {provider.scope?.types && (
                <span className={styles.sourceScope}>· {provider.scope.types.join(', ')}</span>
              )}
            </span>
          ))}
        </div>
      )}

      <div className={styles.filterSection}>
        <div className={styles.searchBar}>
          <Search size={18} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Filtrer les sorties…"
            value={filterQuery}
            onChange={event => setFilterQuery(event.target.value)}
            className={styles.searchInput}
            aria-label="Filtrer les sorties"
          />
          {filterQuery && (
            <button className={styles.clearButton} onClick={() => setFilterQuery('')}>
              Effacer
            </button>
          )}
        </div>
      </div>

      <DiscographyList
        releases={releases}
        counts={counts}
        filterQuery={filterQuery}
        onSearch={handleSearchRelease}
        onToggleMonitor={handleToggleMonitor}
      />

      <SearchModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} query={searchQuery} />

      <SyncOptionsModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSync={handleSync}
        artistName={artist.name}
      />

      {isDeleteModalOpen && (
        <div
          className={styles.modalOverlay}
          onClick={event => {
            if (event.target === event.currentTarget && !deleting) setIsDeleteModalOpen(false);
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
                onChange={event => setDeleteWithFiles(event.target.checked)}
              />
              <span>Supprimer les fichiers du disque</span>
            </label>

            <div className={styles.modalActions}>
              <button
                className={`${styles.button} ${styles.outlineButton}`}
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={deleting}
              >
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
