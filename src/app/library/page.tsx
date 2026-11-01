'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, Disc3, LayoutGrid, List, Plus } from 'lucide-react';
import CollectionHeader from '@/components/library/CollectionTabs';
import Cover from '@/components/ui/Cover';
import SearchField from '@/components/ui/SearchField';
import { useActivityFinished } from '@/hooks/useApi';
import { recall, remember, useScrollMemory } from '@/hooks/useListMemory';
import { api } from '@/lib/ui/api';
import { formatQuality, formatYear, isLossless, plural, tiltFor } from '@/lib/ui/format';
import styles from './Library.module.css';

interface AlbumRow {
  id: number;
  name: string;
  artist_id: number;
  artist_name: string;
  album_artist?: string | null;
  release_date?: string | null;
  quality?: string | null;
  track_count: number;
}

type SortKey = 'recent' | 'date' | 'title' | 'artist';
type Order = 'asc' | 'desc';
type FormatFilter = '' | 'lossless' | 'lossy';

interface Query {
  search: string;
  sortBy: SortKey;
  order: Order;
  format: FormatFilter;
}

interface Snapshot extends Query {
  albums: AlbumRow[];
  page: number;
  total: number;
  view: 'grid' | 'list';
}

const MEMORY_KEY = 'library:albums';
const PAGE_SIZE = 48;

const SORTS: { key: SortKey; label: string; first: Order }[] = [
  { key: 'recent', label: 'Derniers arrivés', first: 'desc' },
  { key: 'artist', label: 'Artiste', first: 'asc' },
  { key: 'title', label: 'Titre', first: 'asc' },
  { key: 'date', label: 'Année', first: 'desc' },
];

const FORMATS: { key: FormatFilter; label: string }[] = [
  { key: '', label: 'Tous' },
  { key: 'lossless', label: 'Sans perte' },
  { key: 'lossy', label: 'À améliorer' },
];

export default function AlbumsPage() {
  // `useSearchParams` impose une frontière Suspense au prérendu.
  return (
    <Suspense>
      <Albums />
    </Suspense>
  );
}

function Albums() {
  const params = useSearchParams();
  const formatParam = params.get('format');
  const initialFormat: FormatFilter | null = formatParam === 'lossy' || formatParam === 'lossless' ? formatParam : null;

  const [restored] = useState(() => recall<Snapshot>(MEMORY_KEY));
  const [search, setSearch] = useState(restored?.search ?? '');
  const [sortBy, setSortBy] = useState<SortKey>(restored?.sortBy ?? 'recent');
  const [order, setOrder] = useState<Order>(restored?.order ?? 'desc');
  const [format, setFormat] = useState<FormatFilter>(initialFormat ?? restored?.format ?? '');
  const [view, setView] = useState<'grid' | 'list'>(restored?.view ?? 'grid');

  const reusable = Boolean(restored && (initialFormat === null || initialFormat === restored.format));
  const [albums, setAlbums] = useState<AlbumRow[]>(reusable ? restored!.albums : []);
  const [page, setPage] = useState(reusable ? restored!.page : 1);
  const [total, setTotal] = useState(reusable ? restored!.total : 0);
  const [loading, setLoading] = useState(!reusable);
  const [error, setError] = useState<string | null>(null);

  const controller = useRef<AbortController | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useScrollMemory(MEMORY_KEY, albums.length > 0);

  useEffect(() => {
    const saved = localStorage.getItem('musicarr:view');
    if (!restored && (saved === 'grid' || saved === 'list')) setView(saved);
  }, [restored]);

  const fetchPage = useCallback(
    async (query: Query, targetPage: number, replace: boolean) => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setLoading(true);
      try {
        const data = await api<{ albums: AlbumRow[]; total: number }>(
          `/api/albums?${new URLSearchParams({
            page: String(targetPage),
            limit: String(PAGE_SIZE),
            sortBy: query.sortBy,
            order: query.order,
            search: query.search,
            format: query.format,
          })}`,
          { signal: current.signal },
        );
        if (current.signal.aborted) return;
        setAlbums(previous => (replace ? data.albums : [...previous, ...data.albums]));
        setTotal(data.total);
        setPage(targetPage);
        setError(null);
      } catch (cause) {
        if (current.signal.aborted) return;
        setError((cause as Error).message);
      } finally {
        if (!current.signal.aborted) setLoading(false);
      }
    },
    [],
  );

  // Toute modification de la requête repart de la première page. La saisie est
  // temporisée pour ne pas interroger le serveur à chaque lettre. La requête n'est
  // tenue pour appliquée qu'une fois lancée : le double passage des effets de
  // StrictMode annule la minuterie du premier, le second doit donc la relancer.
  const signature = JSON.stringify({ search, sortBy, order, format });
  const applied = useRef(reusable ? signature : null);
  useEffect(() => {
    if (applied.current === signature) return;
    const previous = applied.current ? (JSON.parse(applied.current) as Query) : null;
    const typing = previous !== null && previous.search !== search;
    const timeout = setTimeout(() => {
      applied.current = signature;
      fetchPage({ search, sortBy, order, format }, 1, true);
    }, typing ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [signature, search, sortBy, order, format, fetchPage]);

  useEffect(() => {
    remember(MEMORY_KEY, { search, sortBy, order, format, albums, page, total, view } satisfies Snapshot);
  }, [search, sortBy, order, format, albums, page, total, view]);

  useActivityFinished(() => fetchPage({ search, sortBy, order, format }, 1, true));

  const hasMore = albums.length < total;

  useEffect(() => {
    const element = sentinel.current;
    if (!element || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) fetchPage({ search, sortBy, order, format }, page + 1, false);
      },
      { rootMargin: '600px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, loading, page, search, sortBy, order, format, fetchPage]);

  const chooseSort = (key: SortKey, first: Order) => {
    if (sortBy === key) {
      setOrder(current => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setOrder(first);
    }
  };

  const chooseView = (next: 'grid' | 'list') => {
    setView(next);
    localStorage.setItem('musicarr:view', next);
  };

  const OrderIcon = order === 'asc' ? ArrowUp : ArrowDown;

  return (
    <div className="page">
      <CollectionHeader section="albums" />

      <div className={styles.searchRow}>
        <SearchField value={search} onChange={setSearch} placeholder="Un disque, un artiste…" />
          <div className={styles.viewSwitch} role="group" aria-label="Affichage">
            <button type="button" onClick={() => chooseView('grid')} aria-pressed={view === 'grid'} aria-label="Affichage en pochettes">
              <LayoutGrid size={18} />
            </button>
            <button type="button" onClick={() => chooseView('list')} aria-pressed={view === 'list'} aria-label="Affichage en liste">
              <List size={18} />
            </button>
          </div>
      </div>
      <div className={styles.filters}>
        <div className="chips" role="group" aria-label="Tri et format">
          {SORTS.map(sort => (
            <button key={sort.key} type="button" className="chip" aria-pressed={sortBy === sort.key} onClick={() => chooseSort(sort.key, sort.first)}>
              {sort.label}
              {sortBy === sort.key && <OrderIcon size={14} aria-label={order === 'asc' ? 'croissant' : 'décroissant'} />}
            </button>
          ))}
          <span className={styles.chipGap} aria-hidden="true" />
          {FORMATS.map(item => (
            <button key={item.key} type="button" className="chip" aria-pressed={format === item.key} onClick={() => setFormat(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <p className={`mono ${styles.count}`} aria-live="polite">
        {loading && albums.length === 0 ? 'Fouille du bac…' : plural(total, 'disque')}
      </p>

      {error && albums.length === 0 ? (
        <div className="empty">
          <p className="hand">Le bac est coincé.</p>
          <p>{error}</p>
        </div>
      ) : !loading && albums.length === 0 ? (
        <div className="empty">
          <Disc3 size={56} strokeWidth={1.25} />
          <p className="hand">{search || format ? 'Rien dans ce bac.' : 'Le bac est vide.'}</p>
          <p>{search || format ? 'Essayez d’autres mots, ou un autre filtre.' : 'Ajoutez un artiste, ou scannez votre bibliothèque depuis les réglages.'}</p>
          {!search && !format && (
            <Link href="/library/add" className="btn btn-primary">
              <Plus size={18} />
              Ajouter un artiste
            </Link>
          )}
        </div>
      ) : view === 'grid' ? (
        <ul className={styles.grid}>
          {albums.map(album => (
            <li key={album.id}>
              <AlbumCard album={album} />
            </li>
          ))}
          {loading && albums.length === 0 && Array.from({ length: 8 }, (_, index) => (
            <li key={index}>
              <div className={`skeleton ${styles.skeleton}`} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className={styles.list}>
          {albums.map(album => (
            <li key={album.id}>
              <AlbumRowItem album={album} />
            </li>
          ))}
        </ul>
      )}

      <div ref={sentinel} className={styles.sentinel}>
        {loading && albums.length > 0 && <span className="mini-record" aria-label="Chargement" />}
      </div>
    </div>
  );
}

function QualitySticker({ album, className }: { album: AlbumRow; className?: string }) {
  const quality = formatQuality(album.quality);
  if (!quality) return null;
  return (
    <span
      className={`sticker ${isLossless(album.quality) ? 'sticker-flac' : ''} ${className ?? ''}`}
      style={{ '--tilt': tiltFor(album.name, 12) } as React.CSSProperties}
    >
      {quality}
    </span>
  );
}

function AlbumCard({ album }: { album: AlbumRow }) {
  const artist = album.album_artist || album.artist_name;
  return (
    <Link href={`/library/album/${album.id}`} className={styles.card}>
      <div className={styles.sleeve}>
        {/* Le disque qui dépasse de la pochette au survol */}
        <span className={styles.vinyl} aria-hidden="true" />
        <Cover albumId={album.id} name={album.name} artist={artist} sizes="(max-width: 599px) 50vw, (max-width: 899px) 33vw, 200px" morph className={styles.cover}>
          <QualitySticker album={album} className={styles.sticker} />
        </Cover>
      </div>
      <span className={`clamp-2 ${styles.title}`}>{album.name}</span>
      <span className={`mono clamp-1 ${styles.artist}`}>{artist}</span>
      <span className={`mono ${styles.meta}`}>
        {[formatYear(album.release_date), album.track_count ? plural(album.track_count, 'titre') : ''].filter(Boolean).join(' · ')}
      </span>
    </Link>
  );
}

function AlbumRowItem({ album }: { album: AlbumRow }) {
  const artist = album.album_artist || album.artist_name;
  return (
    <Link href={`/library/album/${album.id}`} className={styles.row}>
      <Cover albumId={album.id} name={album.name} sizes="54px" className={styles.rowCover} />
      <span className={styles.rowText}>
        <strong className="clamp-1">{album.name}</strong>
        <span className="mono muted clamp-1">{artist}</span>
      </span>
      <span className={`mono ${styles.rowYear}`}>{formatYear(album.release_date)}</span>
      <QualitySticker album={album} />
    </Link>
  );
}
