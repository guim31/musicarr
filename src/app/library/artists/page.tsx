'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, Settings2 } from 'lucide-react';
import CollectionHeader from '@/components/library/CollectionTabs';
import ArtistArt from '@/components/ui/ArtistArt';
import SearchField from '@/components/ui/SearchField';
import { useActivityFinished, useApi } from '@/hooks/useApi';
import { recall, remember, useScrollMemory } from '@/hooks/useListMemory';
import { CompareUtils } from '@/lib/CompareUtils';
import { dividerFor, plural } from '@/lib/ui/format';
import styles from './Artists.module.css';

interface ArtistRow {
  id: number;
  name: string;
  image?: string | null;
  cover_album_id?: number | null;
  album_count: number;
  downloaded_count: number;
  missing_count: number;
}

type Filter = 'owned' | 'all' | 'wanted';

const FILTER_KEY = 'library:artists:filter';
const SEARCH_KEY = 'library:artists:search';
const SCROLL_KEY = 'library:artists';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'owned', label: 'En collection' },
  { key: 'wanted', label: 'À compléter' },
];

export default function ArtistsPage() {
  const { data, error, loading, reload } = useApi<ArtistRow[]>('/api/artists');
  const [filter, setFilter] = useState<Filter>(() => recall<Filter>(FILTER_KEY) ?? 'all');
  const [search, setSearch] = useState(() => recall<string>(SEARCH_KEY) ?? '');
  const [activeLetter, setActiveLetter] = useState('');
  const sections = useRef(new Map<string, HTMLElement>());
  const letterTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useActivityFinished(reload);
  useScrollMemory(SCROLL_KEY, Boolean(data));

  useEffect(() => {
    remember(FILTER_KEY, filter);
    remember(SEARCH_KEY, search);
  }, [filter, search]);

  const artists = useMemo(() => data ?? [], [data]);

  const counts = useMemo(
    () => ({
      owned: artists.filter(artist => artist.downloaded_count > 0).length,
      wanted: artists.filter(artist => artist.missing_count > 0).length,
      all: artists.length,
    }),
    [artists],
  );

  const groups = useMemo(() => {
    // Recherche normalisée : « ska p » doit trouver « SKA-P ».
    const needle = CompareUtils.normalize(search);
    const matching = artists.filter(artist => {
      if (filter === 'owned' && artist.downloaded_count === 0) return false;
      if (filter === 'wanted' && artist.missing_count === 0) return false;
      return !needle || CompareUtils.normalize(artist.name).includes(needle);
    });
    const byLetter = new Map<string, ArtistRow[]>();
    for (const artist of matching) {
      const letter = dividerFor(artist.name);
      const list = byLetter.get(letter);
      if (list) list.push(artist);
      else byLetter.set(letter, [artist]);
    }
    return [...byLetter.entries()]
      .sort(([a], [b]) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b)))
      .map(([letter, items]) => ({ letter, items }));
  }, [artists, filter, search]);

  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  const jumpTo = (letter: string) => {
    sections.current.get(letter)?.scrollIntoView({ block: 'start' });
    setActiveLetter(letter);
    clearTimeout(letterTimer.current);
    letterTimer.current = setTimeout(() => setActiveLetter(''), 900);
  };

  /** Glisser le pouce le long du rail fait défiler les lettres, comme les intercalaires d'un bac. */
  const onRailMove = (event: React.PointerEvent<HTMLElement>) => {
    if (event.buttons === 0 && event.pointerType === 'mouse') return;
    const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    const letter = target?.dataset.letter;
    if (letter && letter !== activeLetter) jumpTo(letter);
  };

  return (
    <div className="page">
      <CollectionHeader section="artists" />

      <div className={styles.toolbar}>
        <SearchField value={search} onChange={setSearch} placeholder="Un artiste, un groupe…" />
      </div>
      <div className={styles.filters}>
        <div className="chips" role="group" aria-label="Filtrer les artistes">
          {FILTERS.map(item => (
            <button key={item.key} type="button" className="chip" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>
              {item.label} <small>{counts[item.key]}</small>
            </button>
          ))}
        </div>
      </div>

      <p className={`mono ${styles.count}`} aria-live="polite">
        {loading ? 'Fouille du bac…' : plural(total, 'artiste')}
      </p>

      {error ? (
        <div className="empty">
          <p className="hand">Le bac est coincé.</p>
          <p>{error}</p>
        </div>
      ) : !loading && artists.length === 0 ? (
        <div className="empty">
          <p className="hand">Aucun artiste pour l'instant.</p>
          <p>Ajoutez-en un, ou indiquez le dossier de votre musique pour lancer un scan.</p>
          <div className={styles.emptyActions}>
            <Link href="/library/add" className="btn btn-primary">
              <Plus size={18} />
              Ajouter un artiste
            </Link>
            <Link href="/settings" className="btn">
              <Settings2 size={18} />
              Réglages
            </Link>
          </div>
        </div>
      ) : !loading && total === 0 ? (
        <div className="empty">
          <p className="hand">Personne à ce nom.</p>
          <p>Vérifiez l'orthographe, ou cherchez parmi tous les artistes.</p>
        </div>
      ) : (
        <div className={styles.layout}>
          <div className={styles.groups}>
            {loading && <div className={`skeleton ${styles.skeleton}`} />}
            {groups.map(group => (
              <section
                key={group.letter}
                ref={element => {
                  if (element) sections.current.set(group.letter, element);
                  else sections.current.delete(group.letter);
                }}
                className={styles.group}
                aria-label={group.letter === '#' ? 'Chiffres et symboles' : `Lettre ${group.letter}`}
              >
                <h2 className={`display ${styles.divider}`}>
                  <span>{group.letter}</span>
                </h2>
                <ul className={styles.wall}>
                  {group.items.map(artist => (
                    <li key={artist.id}>
                      <Link href={`/library/artist/${artist.id}`} className={styles.artist}>
                        <ArtistArt name={artist.name} image={artist.image} coverAlbumId={artist.cover_album_id} variant="tile" sizes="(max-width: 899px) 54px, 200px" className={styles.art} />
                        <span className={styles.artistText}>
                          <strong className={`display clamp-2 ${styles.artistName}`}>{artist.name}</strong>
                          <span className={`mono ${styles.artistMeta}`}>
                            {plural(artist.downloaded_count, 'disque')}
                            {artist.missing_count > 0 && <em> · {artist.missing_count} manquant{artist.missing_count > 1 ? 's' : ''}</em>}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {groups.length > 3 && (
            <nav
              className={styles.rail}
              aria-label="Aller à une lettre"
              onPointerDown={onRailMove}
              onPointerMove={onRailMove}
            >
              {groups.map(group => (
                <button
                  key={group.letter}
                  type="button"
                  data-letter={group.letter}
                  data-active={activeLetter === group.letter}
                  onClick={() => jumpTo(group.letter)}
                >
                  {group.letter}
                </button>
              ))}
            </nav>
          )}
        </div>
      )}

      {activeLetter && (
        <div className={`display misprint ${styles.bigLetter}`} aria-hidden="true">
          {activeLetter}
        </div>
      )}
    </div>
  );
}
