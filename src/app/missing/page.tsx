'use client';

import React, { useEffect, useState } from 'react';
import { Search, Disc, RefreshCw, CheckCircle2, Filter } from 'lucide-react';
import Link from 'next/link';
import styles from './Missing.module.css';
import SearchModal from '@/components/modals/SearchModal';
import { CompareUtils } from '@/lib/CompareUtils';

interface MissingRow {
  kind: 'lost' | 'never_owned';
  id: string;
  albumId: number | null;
  releaseId: number | null;
  name: string;
  artistId: number;
  artistName: string;
  type: string | null;
  releaseDate: string | null;
}

export default function MissingAlbumsPage() {
  const [rows, setRows] = useState<MissingRow[]>([]);
  const [counts, setCounts] = useState({ total: 0, lost: 0, neverOwned: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAlbumId, setActiveAlbumId] = useState<number | undefined>();

  const fetchMissing = async () => {
    try {
      const res = await fetch('/api/albums/missing');
      const data = await res.json();
      setRows(data.albums ?? []);
      setCounts(data.counts ?? { total: 0, lost: 0, neverOwned: 0 });
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMissing();
  }, []);

  const handleSearch = (row: MissingRow) => {
    setSearchQuery(`${row.artistName} ${row.name}`);
    // Seul un album local peut recevoir le téléchargement ; une sortie jamais
    // possédée sera rattachée au scan qui suivra.
    setActiveAlbumId(row.albumId ?? undefined);
    setIsModalOpen(true);
  };

  const needle = CompareUtils.normalize(filter);
  const filtered = needle
    ? rows.filter(
        row =>
          CompareUtils.normalize(row.name).includes(needle) ||
          CompareUtils.normalize(row.artistName).includes(needle),
      )
    : rows;

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
          <h1>Sorties manquantes</h1>
          <p>
            {counts.total} sortie{counts.total > 1 ? 's' : ''} à récupérer
            {counts.lost > 0 && ` · ${counts.lost} disparue${counts.lost > 1 ? 's' : ''} du disque`}
            {counts.neverOwned > 0 && ` · ${counts.neverOwned} jamais possédée${counts.neverOwned > 1 ? 's' : ''}`}
          </p>
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
            placeholder="Filtrer par artiste ou sortie…"
            value={filter}
            onChange={event => setFilter(event.target.value)}
            aria-label="Filtrer les sorties manquantes"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <CheckCircle2 size={64} color="var(--success)" />
          <h2>Rien ne manque</h2>
          <p>
            Toutes les sorties surveillées sont sur votre disque. Synchronisez la discographie d’un
            artiste puis surveillez ses sorties pour suivre ce qu’il vous reste à récupérer.
          </p>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Artiste</th>
                <th>Sortie</th>
                <th>Année</th>
                <th>Statut</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <tr key={row.id}>
                  <td className={styles.artistCell}>
                    <Link href={`/library/artist/${row.artistId}`}>{row.artistName}</Link>
                  </td>
                  <td className={styles.albumCell}>
                    <div className={styles.albumTitle}>
                      <Disc size={16} />
                      {row.name}
                    </div>
                  </td>
                  <td className={styles.dateCell}>{row.releaseDate?.slice(0, 4) || '—'}</td>
                  <td>
                    <span className={styles.statusBadge}>
                      {row.kind === 'lost' ? 'Fichiers disparus' : 'Jamais possédée'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className={styles.searchBtn} onClick={() => handleSearch(row)}>
                      <Search size={16} />
                      Rechercher
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
