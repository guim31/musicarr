'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Filter, 
  Music, 
  Users, 
  ArrowRight, 
  ExternalLink, 
  ChevronRight,
  Monitor,
  CheckCircle2,
  Clock
} from 'lucide-react';
import Link from 'next/link';
import styles from './Library.module.css';

export default function LibraryPage() {
  const [artists, setArtists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetchArtists();
  }, []);

  const fetchArtists = async () => {
    try {
      const res = await fetch('/api/artists');
      const data = await res.json();
      setArtists(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredArtists = artists.filter(a => 
    a.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Ma Collection</h1>
          <p style={{ color: 'var(--text-muted)' }}>Gérez vos artistes et albums favoris.</p>
        </div>
        <button className={styles.button}>
          <Plus size={20} />
          Ajouter un artiste
        </button>
      </header>

      <div className={styles.searchHeader}>
        <div className={styles.searchInputWrapper}>
          <Search size={18} className={styles.searchIcon} />
          <input 
            type="text" 
            placeholder="Filtrer ma collection..." 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <button className={`${styles.button} ${styles.outlineButton}`}>
          <Filter size={18} />
          Filtres
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
          <Music className="animate-pulse" size={48} color="var(--accent)" />
        </div>
      ) : artists.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '120px 0', 
          color: 'var(--text-muted)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px'
        }}>
          <Users size={64} strokeWidth={1} />
          <div>
            <h2 style={{ color: 'var(--foreground)', marginBottom: '8px' }}>Votre collection est vide</h2>
            <p>Commencez par ajouter des artistes ou scannez votre bibliothèque locale.</p>
          </div>
          <Link href="/settings">
            <button className={`${styles.button} ${styles.outlineButton}`} style={{ marginTop: '16px' }}>
              Configurer le dossier musique
            </button>
          </Link>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Artiste</th>
                <th>Albums</th>
                <th>Collecté</th>
                <th>Statut</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredArtists.map((artist) => (
                <tr key={artist.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ 
                        width: '36px', 
                        height: '36px', 
                        backgroundColor: 'var(--background)', 
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-muted)'
                      }}>
                        <Users size={18} />
                      </div>
                      <Link href={`/library/artist/${artist.id}`} className={styles.artistLink}>
                        <span className={styles.artistName}>{artist.name}</span>
                      </Link>
                    </div>
                  </td>
                  <td>
                    <span style={{ color: 'var(--text-muted)' }}>{artist.album_count} album{artist.album_count > 1 ? 's' : ''}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div className={`${styles.statusBadge} ${artist.downloaded_count === artist.album_count ? styles.downloadedBadge : ''}`}>
                        {artist.downloaded_count} collecté{artist.downloaded_count > 1 ? 's' : ''}
                      </div>
                      {artist.missing_count > 0 && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600 }}>
                          {artist.missing_count} manquant{artist.missing_count > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--success)' }}>
                      <Monitor size={14} />
                      Surveillé
                    </span>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <Link href={`/library/artist/${artist.id}`}>
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
      )}
    </div>
  );
}
