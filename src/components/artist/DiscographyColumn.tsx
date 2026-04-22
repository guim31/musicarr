'use client';

import React from 'react';
import { Search, CheckCircle, ExternalLink, Calendar, Music } from 'lucide-react';
import Link from 'next/link';
import styles from './DiscographyColumn.module.css';

interface RemoteAlbum {
  name: string;
  releaseDate?: string;
  type: string;
  image?: string;
  mbid?: string;
  discogsId?: string;
  deezerId?: string;
  isOwned?: boolean;
  localId?: number;
}

interface DiscographyColumnProps {
  title: string;
  icon: React.ReactNode;
  albums: RemoteAlbum[];
  onSearch: (album: RemoteAlbum) => void;
  color?: string;
  isFiltering?: boolean;
}

export default function DiscographyColumn({ title, icon, albums, onSearch, color, isFiltering }: DiscographyColumnProps) {
  // Sort by date DESC
  const sortedAlbums = [...albums].sort((a, b) => {
    const dateA = a.releaseDate || '0000';
    const dateB = b.releaseDate || '0000';
    return dateB.localeCompare(dateA);
  });

  return (
    <div className={styles.column} style={{ '--accent-color': color } as any}>
      <header className={styles.header}>
        <div className={styles.iconWrapper}>{icon}</div>
        <div className={styles.headerText}>
          <h3>{title}</h3>
          <span>{albums.length} éléments</span>
        </div>
      </header>

      <div className={styles.list}>
        {sortedAlbums.length === 0 ? (
          <div className={styles.empty}>
            {isFiltering ? 'Aucun album ne correspond.' : 'Aucun résultat en cache. Lancez un scan.'}
          </div>
        ) : (
          sortedAlbums.map((album, idx) => {
            const cardContent = (
              <div className={`${styles.card} ${album.isOwned ? styles.owned : styles.missing}`}>
                <div className={styles.cover}>
                  {album.image ? (
                    <img src={album.image} alt={album.name} loading="lazy" />
                  ) : (
                    <div className={styles.placeholder}><Music size={20} /></div>
                  )}
                  {album.isOwned && (
                    <div className={styles.ownedBadge}>
                      <CheckCircle size={14} fill="var(--success)" color="white" />
                    </div>
                  )}
                </div>
                
                <div className={styles.info}>
                  <h4 title={album.name}>{album.name}</h4>
                  <div className={styles.meta}>
                    {album.releaseDate && (
                      <span className={styles.date}>
                        <Calendar size={12} />
                        {album.releaseDate.split('-')[0]}
                      </span>
                    )}
                    <span className={styles.typeBadge}>{album.type}</span>
                  </div>
                </div>

                <div className={styles.actions}>
                  {!album.isOwned && (
                    <button 
                      className={styles.searchBtn} 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSearch(album);
                      }}
                      title="Chercher pour téléchargement"
                    >
                      <Search size={16} />
                    </button>
                  )}
                  {album.isOwned && (
                    <div className={styles.checkIcon} title="Déjà dans la collection">
                      <ExternalLink size={18} color="var(--success)" />
                    </div>
                  )}
                </div>
              </div>
            );

            if (album.isOwned && album.localId) {
              return (
                <Link key={`${album.name}-${idx}`} href={`/library/album/${album.localId}`} className={styles.cardLink}>
                  {cardContent}
                </Link>
              );
            }

            return <React.Fragment key={`${album.name}-${idx}`}>{cardContent}</React.Fragment>;
          })
        )}
      </div>
    </div>
  );
}
