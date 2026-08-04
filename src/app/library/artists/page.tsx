'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Disc,
  Users,
  ChevronRight,
  Monitor,
  RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import styles from '../Library.module.css';

export default function LibraryPage() {
  const [artists, setArtists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  // Déclaré avant l'effet qui l'appelle, pour éviter l'accès en zone morte.
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

  useEffect(() => {
    fetchArtists();
  }, []);

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
        <Link href="/library/add" className={styles.button}>
          <Plus size={20} />
          Ajouter un artiste
        </Link>
      </header>

      {/* TABS NAVIGATION */}
      <nav className={styles.tabs} aria-label="Sections de la collection">
        <Link href="/library" className={styles.tab}>
          Albums
        </Link>
        <span className={`${styles.tab} ${styles.tabActive}`} aria-current="page">
          Artistes
        </span>
      </nav>

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
      </div>

      {loading ? (
        <div className={styles.loadingState}>
          <Disc className="animate-spin" size={48} color="var(--accent)" />
          <p>Chargement de vos artistes...</p>
        </div>
      ) : artists.length === 0 ? (
        <div className={styles.emptyState}>
          <Users size={64} strokeWidth={1} />
          <div>
            <h2>Votre collection est vide</h2>
            <p>Commencez par ajouter des artistes ou scannez votre bibliothèque locale.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link href="/library/add" className={styles.button}>
              <Plus size={18} />
              Ajouter un artiste
            </Link>
            <Link href="/settings" className={`${styles.button} ${styles.outlineButton}`}>
              Configurer le dossier musique
            </Link>
          </div>
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
                      <button 
                        className={`${styles.button} ${styles.outlineButton}`} 
                        style={{ padding: '6px' }}
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/artists/${artist.id}/scan`, { method: 'POST' });
                            const data = await res.json();
                            if (data.success) {
                              fetchArtists(); // Re-fetch data
                            }
                          } catch (e) { console.error(e); }
                        }}
                        title="Scanner le dossier de cet artiste"
                      >
                        <RefreshCw size={14} />
                      </button>
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
