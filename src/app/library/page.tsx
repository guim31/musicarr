'use client';

import React, { useState, useEffect } from 'react';
import { Library as LibraryIcon, Search, Plus, Filter, Music, Users, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function LibraryPage() {
  const [artists, setArtists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetchArtists();
  }, []);

  const fetchArtists = async () => {
    try {
      const res = await fetch('/api/artists');
      const data = await res.json();
      setArtists(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredArtists = artists.filter(a => 
    a.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <h1>Ma Collection</h1>
          <p style={{ color: 'var(--text-muted)' }}>Gérez vos artistes et albums favoris.</p>
        </div>
        <button style={{ 
          backgroundColor: 'var(--accent)', 
          color: 'white', 
          border: 'none', 
          padding: '10px 20px', 
          borderRadius: 'var(--radius)',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Plus size={20} />
          Ajouter un artiste
        </button>
      </header>

      <div style={{ 
        display: 'flex', 
        gap: '16px', 
        marginBottom: '24px',
        padding: '16px',
        backgroundColor: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)'
      }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Filtrer ma collection..." 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '10px 10px 10px 40px', 
              backgroundColor: 'var(--background)', 
              border: '1px solid var(--border)', 
              borderRadius: 'var(--radius)',
              color: 'var(--foreground)'
            }}
          />
        </div>
        <button style={{ 
          background: 'none', 
          border: '1px solid var(--border)', 
          color: 'var(--foreground)',
          padding: '0 16px',
          borderRadius: 'var(--radius)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Filter size={18} />
          Filtres
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
          <Music className="animate-pulse" size={48} color="var(--accent)" />
        </div>
      ) : artists.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '120px 0', 
          color: 'var(--text-muted)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px'
        }}>
          <Users size={64} strokeWidth={1} />
          <div>
            <h2 style={{ color: 'var(--foreground)', marginBottom: '8px' }}>Votre collection est vide</h2>
            <p>Commencez par ajouter des artistes ou scannez votre bibliothèque locale.</p>
          </div>
          <Link href="/settings">
            <button style={{ 
              marginTop: '16px',
              backgroundColor: 'transparent', 
              color: 'var(--accent)', 
              border: '1px solid var(--accent)', 
              padding: '10px 20px', 
              borderRadius: 'var(--radius)',
              fontWeight: 600,
              cursor: 'pointer'
            }}>
              Configurer le dossier musique
            </button>
          </Link>
        </div>
      ) : (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
          gap: '24px' 
        }}>
          {filteredArtists.map((artist) => (
            <div key={artist.id} style={{ 
              backgroundColor: 'var(--card-bg)', 
              border: '1px solid var(--border)', 
              borderRadius: 'var(--radius)', 
              overflow: 'hidden',
              transition: 'var(--transition)',
              cursor: 'pointer'
            }}>
              <div style={{ 
                height: '180px', 
                backgroundColor: 'var(--background)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: 'var(--text-muted)'
              }}>
                <Users size={64} strokeWidth={1} />
              </div>
              <div style={{ padding: '16px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {artist.name}
                </h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {artist.album_count} album{artist.album_count > 1 ? 's' : ''}
                  </span>
                  <ArrowRight size={16} color="var(--text-muted)" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
