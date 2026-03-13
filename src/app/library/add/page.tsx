'use client';

import React, { useState } from 'react';
import { 
  Search, 
  Plus, 
  ArrowLeft,
  Loader2,
  Check,
  Music,
  UserPlus,
  ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './AddArtist.module.css';

export default function AddArtistPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addingArtists, setAddingArtists] = useState<Record<string, boolean>>({});
  const [addedArtists, setAddedArtists] = useState<Record<string, number | boolean>>({});
  const [selectedProvider, setSelectedProvider] = useState<string>('musicbrainz'); // 'musicbrainz' by default

  const providers = [
    { id: 'musicbrainz', label: 'MusicBrainz' },
    { id: 'deezer', label: 'Deezer' },
    { id: 'discogs', label: 'Discogs' },
    { id: 'itunes', label: 'iTunes' },
  ];

  const handleSearch = async (e?: React.FormEvent, forceProvider?: string) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    const providerToUse = forceProvider !== undefined ? forceProvider : selectedProvider;

    setSearching(true);
    setError(null);
    try {
      const url = `/api/artists/search?q=${encodeURIComponent(query)}${providerToUse ? `&provider=${providerToUse}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur lors de la recherche');
      }
      const data = await res.json();
      setResults(data);
      setHasSearched(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId);
    if (query.trim()) {
      handleSearch(undefined, providerId);
    }
  };

  const handleAddArtist = async (artist: any) => {
    const artistKey = artist.mbid || artist.deezerId || artist.discogsId || artist.name;
    setAddingArtists(prev => ({ ...prev, [artistKey]: true }));
    setError(null);

    try {
      const res = await fetch('/api/artists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: artist.name,
          mbid: artist.mbid,
          discogsId: artist.discogsId,
          deezerId: artist.deezerId,
          image: artist.image,
          country: artist.country,
          genre: artist.genre
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de l\'ajout de l\'artiste');
      }
      
      setAddedArtists(prev => ({ ...prev, [artistKey]: data.id || true }));
      // Optional: Show a toast here
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setAddingArtists(prev => ({ ...prev, [artistKey]: false }));
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleWrapper}>
          <Link href="/library" className={styles.backButton}>
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1>Ajouter un Artiste</h1>
            <p style={{ color: 'var(--text-muted)' }}>Recherchez et ajoutez des artistes à votre collection.</p>
          </div>
        </div>
      </header>

      <form className={styles.searchHeader} onSubmit={handleSearch}>
        <div className={styles.searchInputWrapper}>
          <Search className={styles.searchIcon} size={20} />
          <input 
            type="text" 
            className={styles.searchInput} 
            placeholder="Nom de l'artiste..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <button 
          type="submit" 
          className={styles.button}
          disabled={searching || !query.trim()}
        >
          {searching ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
          <span>Rechercher</span>
        </button>
      </form>

      <div className={styles.providerTabs}>
        {providers.map(p => (
          <button
            key={p.id}
            className={`${styles.providerTab} ${selectedProvider === p.id ? styles.active : ''}`}
            onClick={() => handleProviderChange(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ 
          padding: '16px', 
          backgroundColor: 'rgba(239, 68, 68, 0.1)', 
          color: 'var(--danger)', 
          borderRadius: 'var(--radius)',
          marginBottom: '24px',
          border: '1px solid rgba(239, 68, 68, 0.2)'
        }}>
          {error}
        </div>
      )}
      {searching ? (
        <div className={styles.loadingState}>
          <Loader2 size={48} className="animate-spin" color="var(--accent)" />
          <p>Recherche d'artistes en cours...</p>
        </div>
      ) : results.length > 0 ? (
        <div className={styles.resultsGrid}>
          {results.map((artist, idx) => {
            const artistKey = artist.mbid || artist.deezerId || artist.discogsId || artist.name;
            const isAdding = addingArtists[artistKey];
            const isAdded = addedArtists[artistKey];
            
            return (
              <div key={artistKey + idx} className={styles.artistCard}>
                {artist.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={artist.image} alt={artist.name} className={styles.artistImage} loading="lazy" />
                ) : (
                  <div className={styles.artistImage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Music size={32} color="var(--text-muted)" />
                  </div>
                )}
                
                <div className={styles.artistInfo}>
                  <div className={styles.artistName} title={artist.name}>
                    {artist.name}
                  </div>
                  <div className={styles.artistGenre}>
                    {artist.genre} {artist.country && `(${artist.country})`}
                  </div>
                  
                  {isAdded && typeof isAdded === 'number' ? (
                    <Link 
                      href={`/library/artist/${isAdded}`}
                      className={`${styles.addButton} ${styles.viewButton}`}
                    >
                      <ChevronRight size={16} /> Voir la fiche
                    </Link>
                  ) : (
                    <button 
                      onClick={() => handleAddArtist(artist)}
                      className={`${styles.addButton} ${isAdded ? styles.added : ''}`}
                      disabled={isAdding || !!isAdded}
                    >
                      {isAdding ? (
                        <><Loader2 size={16} className="animate-spin" /> Ajout...</>
                      ) : isAdded ? (
                        <><Check size={16} /> Ajouté !</>
                      ) : (
                        <><Plus size={16} /> Ajouter</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : hasSearched && !error ? (
        <div className={styles.emptyState}>
          <UserPlus size={64} strokeWidth={1} />
          <p>Aucun artiste trouvé pour "{query}".</p>
        </div>
      ) : !hasSearched && !error ? (
        <div className={styles.emptyState}>
          <Search size={64} strokeWidth={1} style={{ opacity: 0.5 }} />
          <p>Entrez le nom d'un artiste pour lancer la recherche.</p>
        </div>
      ) : null}
    </div>
  );
}
