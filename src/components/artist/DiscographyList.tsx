'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, Search } from 'lucide-react';
import Cover from '@/components/ui/Cover';
import { CompareUtils } from '@/lib/CompareUtils';
import { formatYear } from '@/lib/ui/format';
import { TYPE_LABELS, type ReleaseType } from '@/services/metadata/releaseTypes';
import styles from './DiscographyList.module.css';

export interface DiscographyRelease {
  /** Absent pour un disque local qu'aucune source n'a rapproché : rien à surveiller. */
  id?: number;
  key: string;
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

type OwnerFilter = 'all' | 'owned' | 'missing';

export default function DiscographyList({ releases, counts, filterQuery, onSearch, onToggleMonitor }: Props) {
  const [activeType, setActiveType] = useState<ReleaseType | 'all'>('all');
  const [owner, setOwner] = useState<OwnerFilter>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Les onglets ne montrent que les types réellement présents : afficher
  // « Bandes originales (0) » pour tout artiste n'apprend rien.
  const availableTypes = useMemo(() => (Object.keys(TYPE_LABELS) as ReleaseType[]).filter(type => (counts[type] ?? 0) > 0), [counts]);

  const ownedCount = useMemo(() => releases.filter(release => release.isOwned).length, [releases]);

  const filtered = useMemo(() => {
    // Filtre normalisé : chercher « elephant » doit trouver « Éléphant ».
    const needle = CompareUtils.normalize(filterQuery);
    return releases.filter(release => {
      if (activeType !== 'all' && release.type !== activeType) return false;
      if (owner === 'owned' && !release.isOwned) return false;
      if (owner === 'missing' && release.isOwned) return false;
      return !needle || CompareUtils.normalize(release.name).includes(needle);
    });
  }, [releases, activeType, owner, filterQuery]);

  const displayed = filtered.slice(0, visibleCount);

  const selectType = (type: ReleaseType | 'all') => {
    setActiveType(type);
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <section className={styles.wrapper} aria-label="Discographie">
      <div className={styles.filters}>
        <div className="chips" role="group" aria-label="Type de sortie">
          <button type="button" className="chip" onClick={() => selectType('all')} aria-pressed={activeType === 'all'}>
            Tout <small>{releases.length}</small>
          </button>
          {availableTypes.map(type => (
            <button key={type} type="button" className="chip" onClick={() => selectType(type)} aria-pressed={activeType === type}>
              {TYPE_LABELS[type]} <small>{counts[type]}</small>
            </button>
          ))}
        </div>
        {ownedCount > 0 && ownedCount < releases.length && (
          <div className="chips" role="group" aria-label="Présence dans la collection">
            <button type="button" className="chip" onClick={() => setOwner('all')} aria-pressed={owner === 'all'}>
              Tout
            </button>
            <button type="button" className="chip" onClick={() => setOwner('owned')} aria-pressed={owner === 'owned'}>
              En collection <small>{ownedCount}</small>
            </button>
            <button type="button" className="chip" onClick={() => setOwner('missing')} aria-pressed={owner === 'missing'}>
              Manquants <small>{releases.length - ownedCount}</small>
            </button>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <p className="hand">{releases.length === 0 ? 'Discographie à découvrir.' : 'Rien par ici.'}</p>
          <p>{releases.length === 0 ? 'Lancez une actualisation pour interroger MusicBrainz, Deezer et Discogs.' : 'Aucune sortie ne correspond à ces filtres.'}</p>
        </div>
      ) : (
        <>
          <ul className={styles.grid}>
            {displayed.map(release => (
              <li key={release.key}>
                <ReleaseCard release={release} onSearch={onSearch} onToggleMonitor={onToggleMonitor} />
              </li>
            ))}
          </ul>

          {filtered.length > visibleCount && (
            <button type="button" className={`btn btn-quiet btn-block ${styles.more}`} onClick={() => setVisibleCount(count => count + PAGE_SIZE)}>
              Afficher les {Math.min(PAGE_SIZE, filtered.length - visibleCount)} suivantes ({filtered.length - visibleCount} restantes)
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
  // La pochette locale d'abord : celle du fournisseur n'est qu'une vignette.
  const local = release.isOwned && release.localId;

  const visual = (
    <div className={styles.sleeve} data-owned={release.isOwned}>
      <Cover
        albumId={local ? release.localId : undefined}
        src={local ? undefined : release.image}
        name={release.name}
        sizes={local ? '(max-width: 599px) 50vw, (max-width: 899px) 33vw, 200px' : undefined}
        morph={Boolean(local)}
        className={styles.cover}
      />
      {!release.isOwned && !release.monitored && <span className={`mono ${styles.ignored}`}>Ignoré</span>}
    </div>
  );

  const titleBlock = (
    <>
      <h3 className={`clamp-2 ${styles.title}`} title={release.name}>
        {release.name}
      </h3>
      <p className={`mono ${styles.meta}`}>
        {release.releaseDate && <span>{formatYear(release.releaseDate)}</span>}
        <span>{TYPE_LABELS[release.type] ?? release.type}</span>
        {/* La provenance, signal utile : une sortie vue par une seule source n'est corroborée par personne. */}
        {release.sources.map(source => (
          <span key={source} className={styles.source} title={SOURCE_LABELS[source]?.title ?? source}>
            {SOURCE_LABELS[source]?.short ?? source.slice(0, 2).toUpperCase()}
          </span>
        ))}
      </p>
    </>
  );

  return (
    <article className={styles.card}>
      {release.localId && release.isOwned ? (
        <Link href={`/library/album/${release.localId}`} className={styles.link}>
          {visual}
          {titleBlock}
        </Link>
      ) : (
        <div className={styles.link}>
          {visual}
          {titleBlock}
        </div>
      )}

      {(!release.isOwned || release.id !== undefined) && (
        <div className={styles.actions}>
          {release.id !== undefined && (
            <button
              type="button"
              className={`btn btn-sm btn-icon btn-quiet ${styles.eye}`}
              data-on={release.monitored}
              onClick={() => onToggleMonitor(release)}
              aria-pressed={release.monitored}
              aria-label={release.monitored ? `Ne plus surveiller ${release.name}` : `Surveiller ${release.name}`}
              title={release.monitored ? 'Surveillé : cliquez pour ignorer' : 'Ignoré : cliquez pour surveiller'}
            >
              {release.monitored ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
          )}
          {!release.isOwned && (
            <button type="button" className={`btn btn-sm ${styles.find}`} onClick={() => onSearch(release)}>
              <Search size={15} />
              Chercher
            </button>
          )}
        </div>
      )}
    </article>
  );
}
