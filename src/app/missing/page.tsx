'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  Disc,
  RefreshCw,
  CheckCircle2,
  Filter
} from 'lucide-react';
import Link from 'next/link';
import styles from './Missing.module.css';
import SearchModal from '@/components/modals/SearchModal';

export default function MissingAlbumsPage() {
  const [albums, setAlbums] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState('');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAlbumId, setActiveAlbumId] = useState<number | undefined>();

  const fetchMissing = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/albums/missing');
      const data = await res.json();
      setAlbums(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMissing();
  }, []);

  const handleSearch = (albumId: number, albumName: string, artistName: string) => {
    setSearchQuery(`${artistName} ${albumName}`);
    setActiveAlbumId(albumId);
    setIsModalOpen(true);
  };

  const filteredAlbums = albums.filter(a => 
    a.name.toLowerCase().includes(filter.toLowerCase()) || 
    a.artist_name.toLowerCase().includes(filter.toLowerCase())
  );

  if (loading) {
    return (
      <div className={styles.loading}>
        <RefreshCw className="animate-spin" size={48} color="var(--accent)" />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Albums Manquants</h1>
          <p>{albums.length} album{albums.length > 1 ? 's' : ''} à récupérer</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.button} onClick={fetchMissing}>
            <RefreshCw size={18} />
            Actualiser
          </button>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.searchBar}>
          <Filter size={18} />
          <input 
            type="text" 
            placeholder="Filtrer par artiste ou album..." 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      {filteredAlbums.length === 0 ? (
        <div className={styles.emptyState}>
          <CheckCircle2 size={64} color="var(--success)" />
          <h2>Votre collection est complète !</h2>
          <p>Tous vos albums surveillés sont déjà sur votre disque.</p>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Artiste</th>
                <th>Album</th>
                <th>Sortie</th>
                <th>Statut</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlbums.map((album) => (
                <tr key={album.id}>
                  <td className={styles.artistCell}>
                    <Link href={`/library/artist/${album.artist_id}`}>
                      {album.artist_name}
                    </Link>
                  </td>
                  <td className={styles.albumCell}>
                    <div className={styles.albumTitle}>
                      <Disc size={16} />
                      {album.name}
                    </div>
                  </td>
                  <td className={styles.dateCell}>{album.release_date || '-'}</td>
                  <td>
                    <span className={styles.statusBadge}>Manquant</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button 
                      className={styles.searchBtn}
                      onClick={() => handleSearch(album.id, album.name, album.artist_name)}
                      disabled={searching[album.id]}
                    >
                      {searching[album.id] ? (
                        <RefreshCw size={16} className="animate-spin" />
                      ) : (
                        <>
                          <Search size={16} />
                          Rechercher
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SearchModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        query={searchQuery}
        albumId={activeAlbumId}
      />
    </div>
  );
}
