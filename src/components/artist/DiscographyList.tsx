'use client';

import React, { useMemo, useState } from 'react';
import { Search, CheckCircle, Calendar, Music, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { CompareUtils } from '@/lib/CompareUtils';
import { TYPE_LABELS, type ReleaseType } from '@/services/metadata/releaseTypes';
import styles from './DiscographyList.module.css';

export interface DiscographyRelease {
  id: number;
  releaseKey: string;
  name: string;
  type: ReleaseType;
  releaseDate?: string;
  image?: string;
  sources: string[];
  localId?: number;
  isOwned: boolean;
  monitored: boolean;
}

interface Props {
  releases: DiscographyRelease[];
  counts: Record<string, number>;
  filterQuery: string;
  onSearch: (release: DiscographyRelease) => void;
  onToggleMonitor: (release: DiscographyRelease) => void;
}

const SOURCE_LABELS: Record<string, { short: string; title: string }> = {
  musicbrainz: { short: 'MB', title: 'MusicBrainz' },
  deezer: { short: 'DZ', title: 'Deezer' },
  discogs: { short: 'DC', title: 'Discogs' },
};

const PAGE_SIZE = 60;

export default function DiscographyList({
  releases,
  counts,
  filterQuery,
  onSearch,
  onToggleMonitor,
}: Props) {
  const [activeType, setActiveType] = useState<ReleaseType | 'all'>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Les onglets ne montrent que les types réellement présents : afficher
  // « Bandes originales (0) » pour tout artiste n'apprend rien.
  const availableTypes = useMemo(
    () =>
      (Object.keys(TYPE_LABELS) as ReleaseType[]).filter(type => (counts[type] ?? 0) > 0),
    [counts],
  );

  const filtered = useMemo(() => {
    // Filtre normalisé : chercher « elephant » doit trouver « Éléphant ».
    const needle = CompareUtils.normalize(filterQuery);
    return releases.filter(release => {
      if (activeType !== 'all' && release.type !== activeType) return false;
      if (!needle) return true;
      return CompareUtils.normalize(release.name).includes(needle);
    });
  }, [releases, activeType, filterQuery]);

  const displayed = filtered.slice(0, visibleCount);

  const selectType = (type: ReleaseType | 'all') => {
    setActiveType(type);
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <section className={styles.wrapper}>
      <nav className={styles.tabs} aria-label="Types de sorties">
        <button
          type="button"
          className={`${styles.tab} ${activeType === 'all' ? styles.tabActive : ''}`}
          onClick={() => selectType('all')}
          aria-pressed={activeType === 'all'}
        >
          Tout <span className={styles.tabCount}>{releases.length}</span>
        </button>
        {availableTypes.map(type => (
          <button
            key={type}
            type="button"
            className={`${styles.tab} ${activeType === type ? styles.tabActive : ''}`}
            onClick={() => selectType(type)}
            aria-pressed={activeType === type}
          >
            {TYPE_LABELS[type]} <span className={styles.tabCount}>{counts[type]}</span>
          </button>
        ))}
      </nav>

      {filtered.length === 0 ? (
        <p className={styles.empty}>
          {releases.length === 0
            ? 'Aucune sortie en cache. Lancez une synchronisation.'
            : 'Aucune sortie ne correspond à ce filtre.'}
        </p>
      ) : (
        <>
          <ul className={styles.grid}>
            {displayed.map(release => (
              <li key={release.id}>
                <ReleaseCard
                  release={release}
                  onSearch={onSearch}
                  onToggleMonitor={onToggleMonitor}
                />
              </li>
            ))}
          </ul>

          {filtered.length > visibleCount && (
            <button
              type="button"
              className={styles.loadMore}
              onClick={() => setVisibleCount(count => count + PAGE_SIZE)}
            >
              Afficher plus ({filtered.length - visibleCount} restantes)
            </button>
          )}
        </>
      )}
    </section>
  );
}

function ReleaseCard({
  release,
  onSearch,
  onToggleMonitor,
}: {
  release: DiscographyRelease;
  onSearch: (release: DiscographyRelease) => void;
  onToggleMonitor: (release: DiscographyRelease) => void;
}) {
  const body = (
    <article className={`${styles.card} ${release.isOwned ? styles.owned : styles.missing}`}>
      <div className={styles.cover}>
        {release.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={release.image} alt="" loading="lazy" />
        ) : (
          <div className={styles.placeholder}>
            <Music size={20} />
          </div>
        )}
        {release.isOwned && (
          <span className={styles.ownedBadge} title="Dans la collection">
            <CheckCircle size={14} fill="var(--success)" color="white" />
          </span>
        )}
      </div>

      <div className={styles.info}>
        <h4 title={release.name}>{release.name}</h4>
        <div className={styles.meta}>
          {release.releaseDate && (
            <span className={styles.date}>
              <Calendar size={12} />
              {release.releaseDate.slice(0, 4)}
            </span>
          )}
          <span className={styles.typeBadge}>{TYPE_LABELS[release.type] ?? release.type}</span>
          {/* La provenance devient un attribut de la ligne, au lieu de
              justifier une colonne par fournisseur. */}
          <span className={styles.sources}>
            {release.sources.map(source => (
              <span
                key={source}
                className={`${styles.sourcePill} ${styles[`source_${source}`] ?? ''}`}
                title={SOURCE_LABELS[source]?.title ?? source}
              >
                {SOURCE_LABELS[source]?.short ?? source.slice(0, 2).toUpperCase()}
              </span>
            ))}
          </span>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.iconBtn} ${release.monitored ? styles.monitored : ''}`}
          onClick={event => {
            event.preventDefault();
            event.stopPropagation();
            onToggleMonitor(release);
          }}
          title={release.monitored ? 'Ne plus surveiller' : 'Surveiller cette sortie'}
          aria-label={release.monitored ? 'Ne plus surveiller' : 'Surveiller cette sortie'}
        >
          {release.monitored ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>

        {!release.isOwned && (
          <button
            type="button"
            className={styles.iconBtn}
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              onSearch(release);
            }}
            title="Chercher pour téléchargement"
            aria-label="Chercher pour téléchargement"
          >
            <Search size={16} />
          </button>
        )}
      </div>
    </article>
  );

  if (release.isOwned && release.localId) {
    return (
      <Link href={`/library/album/${release.localId}`} className={styles.cardLink}>
        {body}
      </Link>
    );
  }

  return body;
}
