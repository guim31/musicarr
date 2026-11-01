'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Search } from 'lucide-react';
import SearchModal from '@/components/modals/SearchModal';
import Cover from '@/components/ui/Cover';
import PageHeader from '@/components/ui/PageHeader';
import SearchField from '@/components/ui/SearchField';
import { useActivityFinished, useApi } from '@/hooks/useApi';
import { recall, remember, useScrollMemory } from '@/hooks/useListMemory';
import { CompareUtils } from '@/lib/CompareUtils';
import { formatYear, plural } from '@/lib/ui/format';
import { TYPE_LABELS } from '@/services/metadata/releaseTypes';
import styles from './Missing.module.css';

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
  image: string | null;
}

interface MissingData {
  albums: MissingRow[];
  counts: { total: number; lost: number; neverOwned: number };
}

const STEP = 60;
const MEMORY_KEY = 'missing:filters';

interface Filters {
  type: string;
  filter: string;
}

/** La base garde aussi d'anciens types, hors du vocabulaire actuel. */
const LEGACY_LABELS: Record<string, string> = { autre: 'Sans type', other: 'Autres', broadcast: 'Diffusions' };

function typeLabel(type: string): string {
  return TYPE_LABELS[type as keyof typeof TYPE_LABELS] ?? LEGACY_LABELS[type] ?? type;
}

export default function MissingAlbumsPage() {
  const { data, loading, error, reload } = useApi<MissingData>('/api/albums/missing');
  const [saved] = useState(() => recall<Filters>(MEMORY_KEY));
  const [filter, setFilter] = useState(saved?.filter ?? '');
  const [type, setType] = useState(saved?.type ?? 'all');
  const [visible, setVisible] = useState(STEP);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAlbumId, setActiveAlbumId] = useState<number | undefined>();
  const sentinel = useRef<HTMLDivElement>(null);

  useActivityFinished(reload);
  useScrollMemory('missing', Boolean(data));

  useEffect(() => {
    remember(MEMORY_KEY, { filter, type } satisfies Filters);
  }, [filter, type]);

  const rows = useMemo(() => data?.albums ?? [], [data]);

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = row.type ?? 'autre';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // Les albums d'abord : c'est ce qu'on vient chercher, pas les 400 apparitions.
    const order = ['album', 'ep', 'live', 'compilation', 'single', 'soundtrack', 'remix', 'demo', 'appearance'];
    return [...counts.entries()].sort(([a], [b]) => {
      const rankA = order.indexOf(a);
      const rankB = order.indexOf(b);
      return (rankA === -1 ? 99 : rankA) - (rankB === -1 ? 99 : rankB);
    });
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = CompareUtils.normalize(filter);
    return rows.filter(row => {
      if (type !== 'all' && (row.type ?? 'autre') !== type) return false;
      return !needle || CompareUtils.normalize(row.name).includes(needle) || CompareUtils.normalize(row.artistName).includes(needle);
    });
  }, [rows, filter, type]);

  const hasMore = filtered.length > visible;

  useEffect(() => {
    const element = sentinel.current;
    if (!element || !hasMore) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) setVisible(count => count + STEP);
      },
      { rootMargin: '500px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, filtered.length]);

  const chooseType = (next: string) => {
    setType(next);
    setVisible(STEP);
  };

  const openSearch = (row: MissingRow) => {
    setSearchQuery(`${row.artistName} ${row.name}`);
    // Seul un album local peut recevoir le téléchargement ; une sortie jamais
    // possédée sera rattachée au scan qui suivra.
    setActiveAlbumId(row.albumId ?? undefined);
    setModalOpen(true);
  };

  const total = data?.counts.total ?? 0;

  return (
    <div className="page">
      <PageHeader
        mark="Face B · Piste 1"
        tapeClass="tape-hot"
        title="Avis de recherche"
        subtitle={data ? `${plural(total, 'sortie recherchée', 'sorties recherchées')}. Commencez par les albums : le reste est souvent du bonus.` : undefined}
        actions={
          <button type="button" className="btn btn-icon btn-quiet" onClick={reload} aria-label="Actualiser">
            <RefreshCw size={18} />
          </button>
        }
      />

      <div className={styles.toolbar}>
        <SearchField value={filter} onChange={value => { setFilter(value); setVisible(STEP); }} placeholder="Un artiste, une sortie…" />
      </div>

      {typeCounts.length > 1 && (
        <div className="chips" role="group" aria-label="Type de sortie">
          <button type="button" className="chip" aria-pressed={type === 'all'} onClick={() => chooseType('all')}>
            Tout <small>{rows.length}</small>
          </button>
          {typeCounts.map(([key, count]) => (
            <button key={key} type="button" className="chip" aria-pressed={type === key} onClick={() => chooseType(key)}>
              {typeLabel(key)} <small>{count}</small>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className={`skeleton ${styles.skeleton}`} />
      ) : error ? (
        <div className="empty">
          <p className="hand">Le registre est illisible.</p>
          <p>{error}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <p className="hand">Plus personne en cavale !</p>
          <p>Toutes les sorties surveillées sont sur le disque. Synchronisez la discographie d’un artiste pour voir ce qu’il vous reste à récupérer.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <p className="hand">Aucun suspect.</p>
          <p>Rien ne correspond à ces filtres.</p>
        </div>
      ) : (
        <>
          <ul className={styles.list}>
            {filtered.slice(0, visible).map(row => (
              <li key={row.id} className={styles.row}>
                <Cover
                  src={row.image}
                  albumId={row.image ? undefined : (row.albumId ?? undefined)}
                  name={row.name}
                  sizes="58px"
                  className={styles.cover}
                />
                <div className={styles.text}>
                  <h2 className={`clamp-2 ${styles.title}`}>{row.name}</h2>
                  <Link href={`/library/artist/${row.artistId}`} className={`mono clamp-1 ${styles.artist}`}>
                    {row.artistName}
                  </Link>
                  <p className={`mono ${styles.meta}`}>
                    {[formatYear(row.releaseDate), row.type ? typeLabel(row.type) : ''].filter(Boolean).join(' · ') || 'Sans date'}
                  </p>
                </div>
                <button type="button" className={`btn btn-sm ${styles.find}`} onClick={() => openSearch(row)} aria-label={`Chercher ${row.name}`}>
                  <Search size={16} />
                  <span>Chercher</span>
                </button>
              </li>
            ))}
          </ul>
          <div ref={sentinel} aria-hidden="true" />
        </>
      )}

      <SearchModal isOpen={modalOpen} onClose={() => setModalOpen(false)} query={searchQuery} albumId={activeAlbumId} />
    </div>
  );
}
