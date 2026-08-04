'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  Disc,
  DownloadCloud,
  FileAudio,
  ArrowRight,
  Clock
} from 'lucide-react';
import styles from './page.module.css';
import Link from 'next/link';

export default function Home() {
  const [statsData, setStatsData] = useState({
    artists: 0,
    albums: 0,
    missing: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [libraryRes, missingRes] = await Promise.all([
          fetch('/api/library'),
          fetch('/api/albums/missing')
        ]);
        const library = await libraryRes.json();
        const missing = missingRes.ok ? await missingRes.json() : [];
        setStatsData({
          artists: library.stats?.artists ?? 0,
          albums: library.stats?.albums ?? 0,
          missing: Array.isArray(missing) ? missing.length : 0
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const stats = [
    { label: 'Artistes', value: statsData.artists.toString(), icon: Users, href: '/library/artists' },
    { label: 'Albums', value: statsData.albums.toString(), icon: Disc, href: '/library' },
    { label: 'Albums manquants', value: statsData.missing.toString(), icon: DownloadCloud, href: '/missing' },
    { label: 'Qualité cible', value: 'FLAC', icon: FileAudio, href: '/settings', static: true },
  ];

  return (
    <div>
      <header>
        <h1>Tableau de bord</h1>
        <p className={styles.subtitle}>Bienvenue sur Musicarr. Voici un aperçu de votre bibliothèque.</p>
      </header>

      <div className={styles.grid}>
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className={styles.card}>
            <div className={styles.cardContent}>
              <div>
                <p className={styles.statLabel}>{stat.label}</p>
                <h2 className={styles.statValue}>{loading && !stat.static ? '…' : stat.value}</h2>
              </div>
              <stat.icon size={24} color="var(--accent)" aria-hidden="true" />
            </div>
          </Link>
        ))}
      </div>

      <div className={styles.sectionHeader}>
        <h2>Activité récente</h2>
        <Link href="/activity" className={styles.viewAllButton}>
          Voir tout
          <ArrowRight size={16} />
        </Link>
      </div>

      <div className={styles.emptyActivity}>
        <Clock size={48} strokeWidth={1} />
        <p>Aucune activité récente. Vos téléchargements apparaîtront ici.</p>
      </div>
    </div>
  );
}
