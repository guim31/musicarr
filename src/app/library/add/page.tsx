'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Plus, RefreshCw, Search } from 'lucide-react';
import ArtistArt from '@/components/ui/ArtistArt';
import PageHeader from '@/components/ui/PageHeader';
import { useToast } from '@/context/ToastContext';
import { api, postJson } from '@/lib/ui/api';
import styles from './AddArtist.module.css';

interface ArtistResult {
  name: string;
  mbid?: string;
  deezerId?: string;
  discogsId?: string;
  image?: string;
  country?: string;
  genre?: string;
}

const PROVIDERS = [
  { id: 'musicbrainz', label: 'MusicBrainz' },
  { id: 'deezer', label: 'Deezer' },
  { id: 'discogs', label: 'Discogs' },
  { id: 'itunes', label: 'iTunes' },
];

const keyFor = (artist: ArtistResult) => artist.mbid || artist.deezerId || artist.discogsId || artist.name;

export default function AddArtistPage() {
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ArtistResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<Record<string, boolean>>({});
  const [added, setAdded] = useState<Record<string, number>>({});
  const [provider, setProvider] = useState('musicbrainz');

  const runSearch = async (term: string, source: string) => {
    if (!term.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const data = await api<ArtistResult[]>(`/api/artists/search?q=${encodeURIComponent(term)}&provider=${source}`);
      setResults(data);
      setSubmitted(term);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const chooseProvider = (next: string) => {
    setProvider(next);
    runSearch(query, next);
  };

  const addArtist = async (artist: ArtistResult) => {
    const key = keyFor(artist);
    setAdding(current => ({ ...current, [key]: true }));
    try {
      const data = await postJson<{ id: number }>('/api/artists', {
        name: artist.name,
        mbid: artist.mbid,
        discogsId: artist.discogsId,
        deezerId: artist.deezerId,
        image: artist.image,
        country: artist.country,
        genre: artist.genre,
      });
      setAdded(current => ({ ...current, [key]: data.id }));
      showToast(`${artist.name} rejoint la collection.`, 'success');
    } catch (cause) {
      showToast((cause as Error).message, 'error');
    } finally {
      setAdding(current => ({ ...current, [key]: false }));
    }
  };

  return (
    <div className="page">
      <Link href="/library/artists" className={styles.back}>
        <ArrowLeft size={16} />
        Artistes
      </Link>
      <PageHeader mark="Nouveau venu" title="Ajouter un artiste" />

      <form
        className={styles.form}
        role="search"
        onSubmit={event => {
          event.preventDefault();
          runSearch(query, provider);
        }}
      >
        <div className={styles.field}>
          <Search size={20} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Nom de l’artiste…"
            aria-label="Nom de l’artiste"
            autoComplete="off"
            enterKeyHint="search"
            autoFocus
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={searching || !query.trim()}>
          {searching ? <RefreshCw size={18} className="spin" /> : <Search size={18} />}
          Chercher
        </button>
      </form>

      <div className={`chips ${styles.providers}`} role="group" aria-label="Source de la recherche">
        {PROVIDERS.map(item => (
          <button key={item.id} type="button" className="chip" aria-pressed={provider === item.id} onClick={() => chooseProvider(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      {error && <div className={`notice notice-bad ${styles.notice}`}>{error}</div>}

      {searching ? (
        <div className="empty">
          <span className="mini-record" aria-hidden="true" />
          <p>On passe un coup de fil à {PROVIDERS.find(item => item.id === provider)?.label}…</p>
        </div>
      ) : results.length > 0 ? (
        <ul className={styles.results}>
          {results.map((artist, index) => {
            const key = keyFor(artist);
            const isAdded = added[key];
            return (
              <li key={`${key}-${index}`} className={styles.result}>
                <ArtistArt name={artist.name} image={artist.image} className={styles.art} />
                <div className={styles.text}>
                  <h2 className={`display clamp-2 ${styles.name}`}>{artist.name}</h2>
                  {(artist.genre || artist.country) && <p className={`mono ${styles.meta}`}>{[artist.genre, artist.country].filter(Boolean).join(' · ')}</p>}
                </div>
                {isAdded ? (
                  <Link href={`/library/artist/${isAdded}`} className={`btn btn-sm ${styles.action}`}>
                    <Check size={15} />
                    Voir
                    <ArrowRight size={15} />
                  </Link>
                ) : (
                  <button type="button" className={`btn btn-sm btn-primary ${styles.action}`} onClick={() => addArtist(artist)} disabled={adding[key]}>
                    {adding[key] ? <RefreshCw size={15} className="spin" /> : <Plus size={15} />}
                    Ajouter
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        !error && (
          <div className="empty">
            <p className="hand">{submitted ? 'Inconnu au bataillon.' : 'Qui veux-tu suivre ?'}</p>
            <p>{submitted ? `Personne à « ${submitted} » chez ${PROVIDERS.find(item => item.id === provider)?.label}. Tentez une autre source.` : 'Cherchez un groupe pour l’ajouter à la collection et suivre ses sorties.'}</p>
          </div>
        )
      )}
    </div>
  );
}
