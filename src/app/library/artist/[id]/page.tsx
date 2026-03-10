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
  Heart
} from 'lucide-react';
import Link from 'next/link';
import styles from './ArtistDetail.module.css';

export default function ArtistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const [artist, setArtist] = useState<any>(null);
  const [albums, setAlbums] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
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
    fetchData();
  }, [id]);

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
            <button className={styles.button}>Tout rechercher</button>
          </div>
        </div>
      </header>

      <section className={styles.albumsSection}>
        <div style={{ padding: '0 0 24px 0', borderBottom: '1px solid var(--border)', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '1.25rem' }}>Albums</h2>
        </div>

        <div className={styles.albumsGrid}>
          {albums.map((album) => (
            <Link key={album.id} href={`/library/album/${album.id}`} className={styles.albumCardLink}>
              <div className={styles.albumCard}>
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
          ))}
        </div>
      </section>
    </div>
  );
}
