'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Music,
  Disc,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  RefreshCw,
  Tags
} from 'lucide-react';
import Link from 'next/link';
import styles from './AlbumDetail.module.css';
import { useToast } from '@/context/ToastContext';
import TagEditorModal from '@/components/modals/TagEditorModal';
import OrganizeFilesModal from '@/components/modals/OrganizeFilesModal';

export default function AlbumDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const [album, setAlbum] = useState<any>(null);
  const [tracks, setTracks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [organizeModalOpen, setOrganizeModalOpen] = useState(false);
  const { showToast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      const [albumRes, tracksRes] = await Promise.all([
        fetch(`/api/albums/${id}`),
        fetch(`/api/albums/${id}/tracks`)
      ]);
      
      const albumData = await albumRes.json();
      const tracksData = await tracksRes.json();

      setAlbum(albumRes.ok && !albumData.error ? albumData : null);
      
      // Sécurité tracks
      if (Array.isArray(tracksData)) {
        setTracks(tracksData);
        if (tracksData.length === 0) setTrackError("Aucune piste trouvée (locale ou distante).");
      } else {
        setTracks([]);
        setTrackError("Erreur lors de la récupération des pistes.");
      }
    } catch (err) {
      console.error(err);
      setTrackError("Erreur de connexion au serveur.");
    } finally {
      setLoading(false);
      setLoadingTracks(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Écouter les événements de fin d'activité pour rafraîchir les données
  useEffect(() => {
    const handleActivityFinished = (event: any) => {
      const activity = event.detail;
      // Rafraîchir si l'activité concerne cet album ou cet artiste
      if (
        (activity.album_id && activity.album_id === parseInt(id)) || 
        (activity.artist_id && album && activity.artist_id === album.artist_id) ||
        activity.type === 'scan'
      ) {
        console.log('[AlbumDetail] Activity finished, refreshing data...');
        fetchData();
      }
    };

    window.addEventListener('musicarr:activity-finished', handleActivityFinished);
    return () => window.removeEventListener('musicarr:activity-finished', handleActivityFinished);
  }, [id, album, fetchData]);

  const formatDuration = (seconds: number) => {
    if (!seconds || Number.isNaN(seconds)) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRename = async () => {
    setRenaming(true);
    try {
      const res = await fetch(`/api/albums/${id}/rename`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast("Album organisé avec succès !", "success");
        setOrganizeModalOpen(false);
        fetchData();
        // Optionnel : recharger la page si le chemin d'artiste change radicalement 
        // ou si on veut forcer un rafraîchissement complet
        // window.location.reload(); 
      } else {
        throw new Error(data.error || "Erreur lors de l'organisation");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setRenaming(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <Disc className="animate-spin" size={48} color="var(--accent)" />
        <p>Chargement de l&apos;album...</p>
      </div>
    );
  }

  if (!album) {
    return (
      <div className={styles.loadingState}>
        <AlertCircle size={48} color="var(--danger)" />
        <h2>Album non trouvé</h2>
        <Link href="/library" className={styles.backLink}>
          <ArrowLeft size={18} />
          Retour à la collection
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Link href={`/library/artist/${album.artist_id}`} className={styles.backLink}>
        <ArrowLeft size={18} />
        {album.artist_name}
      </Link>

      <header className={styles.header}>
        <div className={styles.albumHeader}>
          <div className={styles.albumCover}>
            <img 
              src={`/api/albums/${album.id}/cover?v=${new Date().getTime()}`} 
              alt={album.name} 
              onError={(e: any) => e.target.style.display = 'none'}
            />
            <Disc size={64} strokeWidth={1} />
          </div>
          <div className={styles.albumIntro}>
            <Link href={`/library/artist/${album.artist_id}`} className={styles.artistLink}>
              {album.artist_name}
            </Link>
            <h1>{album.name}</h1>
            <div className={styles.albumMeta}>
              <span>{album.release_date || 'Année inconnue'}</span>
              <span className={styles.dot}>•</span>
              <span>{tracks.length} titre{tracks.length > 1 ? 's' : ''}</span>
              <span className={styles.dot}>•</span>
              <span className={styles.qualityBadge}>{album.quality}</span>
            </div>
            <div className={styles.albumActions}>
              <button
                className={`${styles.button} ${styles.outlineButton}`}
                onClick={() => setOrganizeModalOpen(true)}
                disabled={renaming}
              >
                {renaming ? <RefreshCw className="animate-spin" size={18} /> : <HardDrive size={18} />}
                {renaming ? 'Organisation...' : 'Organiser les fichiers'}
              </button>
              <button 
                className={`${styles.button} ${styles.outlineButton}`}
                onClick={() => setTagModalOpen(true)}
              >
                <Tags size={18} />
                Éditer les Tags
              </button>
            </div>
          </div>
        </div>
      </header>

      <section className={styles.tracksSection}>
        <table className={styles.tracksTable}>
          <thead>
            <tr>
              <th style={{ width: '40px' }}>#</th>
              <th>Titre</th>
              <th>Durée</th>
              <th>Débit</th>
              <th>Format</th>
              <th style={{ textAlign: 'right' }}>Statut</th>
            </tr>
          </thead>
          <tbody>
            {loadingTracks ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '48px' }}>
                  <RefreshCw className="animate-spin" style={{ margin: '0 auto', marginBottom: '12px', color: 'var(--accent)' }} />
                  <p style={{ color: 'var(--text-muted)' }}>Récupération de la liste des titres...</p>
                </td>
              </tr>
            ) : tracks.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '48px' }}>
                  <Music size={32} style={{ margin: '0 auto', marginBottom: '12px', opacity: 0.2 }} />
                  <p style={{ color: 'var(--text-muted)' }}>{trackError || "Aucune piste disponible."}</p>
                </td>
              </tr>
            ) : (
              tracks.map((track) => (
                <tr key={track.id} className={!track.isLocal ? styles.remoteTrack : ''}>
                  <td className={styles.trackNumber}>{track.number || '-'}</td>
                  <td className={styles.trackTitle}>{track.title}</td>
                  <td className={styles.trackMeta}>{formatDuration(track.duration)}</td>
                  <td className={styles.trackMeta}>
                    {track.isLocal ? (track.bitrate ? `${track.bitrate} kbps` : '-') : '-'}
                  </td>
                  <td className={styles.trackMeta}>
                    {track.isLocal ? <span className={styles.formatTag}>{track.quality}</span> : '-'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {track.isLocal ? (
                      <CheckCircle2 color="var(--success)" size={16} />
                    ) : (
                      <span className={styles.statusMissing}>Non téléchargé</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* Debug Info */}
      {(album.mbid || album.metadata?.deezerId) && (
        <div className={styles.debugInfo}>
          {album.mbid && <span>MBID: {album.mbid}</span>}
          {album.mbid && album.metadata?.deezerId && <span> | </span>}
          {album.metadata?.deezerId && <span>Deezer: {album.metadata.deezerId}</span>}
        </div>
      )}

      <TagEditorModal 
        isOpen={tagModalOpen}
        onClose={() => setTagModalOpen(false)}
        album={album}
        tracks={tracks}
        onSaveSuccess={fetchData}
      />

      <OrganizeFilesModal
        isOpen={organizeModalOpen}
        onClose={() => setOrganizeModalOpen(false)}
        albumId={parseInt(id)}
        onConfirm={handleRename}
        loading={renaming}
        albumName={album.name}
      />
    </div>
  );
}
