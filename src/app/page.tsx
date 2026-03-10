'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Disc, 
  DownloadCloud, 
  FileAudio,
  Search,
  Music,
  ArrowRight,
  Clock
} from 'lucide-react';
import styles from './page.module.css';
import Link from 'next/link';

export default function Home() {
  const [statsData, setStatsData] = useState({
    artists: 0,
    albums: 0,
    missing: 0,
    quality: 'FLAC'
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/library');
        const data = await res.json();
        if (data.stats) {
          setStatsData(prev => ({
            ...prev,
            artists: data.stats.artists,
            albums: data.stats.albums
          }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const stats = [
    { label: 'Artistes', value: statsData.artists.toString(), icon: Users },
    { label: 'Albums', value: statsData.albums.toString(), icon: Disc },
    { label: 'Releases Manquantes', value: '0', icon: DownloadCloud }, // À implémenter avec MusicBrainz
    { label: 'Qualité Cible', value: 'FLAC', icon: FileAudio },
  ];

  return (
    <div>
      <header>
        <h1>Tableau de bord</h1>
        <p style={{ color: 'var(--text-muted)' }}>Bienvenue sur Musicarr. Voici un aperçu de votre bibliothèque.</p>
      </header>

      <div className={styles.grid}>
        {stats.map((stat, i) => (
          <div key={i} className={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p className={styles.statLabel}>{stat.label}</p>
                <h2 className={styles.statValue}>{stat.value}</h2>
              </div>
              <stat.icon size={24} color="var(--accent)" />
            </div>
          </div>
        ))}
      </div>

      <div className={styles.sectionHeader}>
        <h2>Activité récente</h2>
        <Link href="/library">
          <button style={{ 
            backgroundColor: 'transparent', 
            color: 'var(--accent)', 
            border: '1px solid var(--accent)', 
            padding: '6px 16px', 
            borderRadius: 'var(--radius)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer'
          }}>
            Voir tout
            <ArrowRight size={16} />
          </button>
        </Link>
      </div>

      <div style={{ 
        backgroundColor: 'var(--card-bg)', 
        border: '1px solid var(--border)', 
        borderRadius: 'var(--radius)', 
        padding: '40px',
        textAlign: 'center',
        color: 'var(--text-muted)'
      }}>
        <Clock size={48} strokeWidth={1} style={{ marginBottom: '16px', opacity: 0.5 }} />
        <p>Aucune activité récente. Vos téléchargements apparaîtront ici.</p>
      </div>
    </div>
  );
}
