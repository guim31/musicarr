'use client';

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Music, 
  Disc, 
  Clock, 
  FileAudio, 
  CheckCircle2, 
  AlertCircle,
  Play,
  Volume2,
  HardDrive,
  Type,
  RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import styles from './AlbumDetail.module.css';
import { useToast } from '@/context/ToastContext';

export default function AlbumDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const [album, setAlbum] = useState<any>(null);
  const [tracks, setTracks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [albumRes, tracksRes] = await Promise.all([
          fetch(`/api/albums/${id}`),
          fetch(`/api/albums/${id}/tracks`)
        ]);
        
        const albumData = await albumRes.json();
        const tracksData = await tracksRes.json();
        
        setAlbum(albumData);
        setTracks(tracksData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRename = async () => {
    if (!confirm("Voulez-vous renommer les dossiers et fichiers de cet album avec des underscores ?")) return;
    
    setRenaming(true);
    try {
      const res = await fetch(`/api/albums/${id}/rename`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast("Album renommé avec succès !", "success");
        window.location.reload(); // Recharger pour voir les nouveaux chemins (via scan)
      } else {
        throw new Error(data.error || "Erreur lors du renommage");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setRenaming(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
        <Music className="animate-pulse" size={48} color="var(--accent)" />
      </div>
    );
  }

  if (!album) {
    return (
      <div style={{ textAlign: 'center', padding: '100px' }}>
        <AlertCircle size={48} color="var(--danger)" />
        <h2 style={{ marginTop: '16px' }}>Album non trouvé</h2>
        <Link href="/library" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Retour à la collection</Link>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.albumHeader}>
          <div className={styles.albumCover}>
            <img 
              src={`/api/albums/${album.id}/cover`} 
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
              <button className={styles.button}>
                <Play size={18} fill="currentColor" />
                Lire tout
              </button>
              <button 
                className={`${styles.button} ${styles.outlineButton}`}
                onClick={handleRename}
                disabled={renaming}
              >
                {renaming ? <RefreshCw className="animate-spin" size={18} /> : <Type size={18} />}
                {renaming ? 'Renommage...' : 'Normaliser noms'}
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
            {tracks.map((track) => (
              <tr key={track.id}>
                <td className={styles.trackNumber}>{track.number || '-'}</td>
                <td className={styles.trackTitle}>{track.title}</td>
                <td className={styles.trackMeta}>{formatDuration(track.duration)}</td>
                <td className={styles.trackMeta}>
                  {track.bitrate ? `${track.bitrate} kbps` : '-'}
                </td>
                <td className={styles.trackMeta}>
                  <span className={styles.formatTag}>{track.quality}</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <CheckCircle2 color="var(--success)" size={16} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
