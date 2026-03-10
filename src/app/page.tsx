import React from 'react';
import { 
  Users, 
  Disc, 
  DownloadCloud, 
  FileAudio,
  Search
} from 'lucide-react';
import styles from './page.module.css';

export default function Home() {
  const stats = [
    { label: 'Artistes', value: '142', icon: Users },
    { label: 'Albums', value: '1,280', icon: Disc },
    { label: 'Titres', value: '18,452', icon: FileAudio },
    { label: 'Releases Manquantes', value: '24', icon: DownloadCloud },
  ];

  const recentMissing = [
    { artist: 'Pink Floyd', album: 'The Dark Side of the Moon', date: '1973', quality: 'FLAC' },
    { artist: 'Daft Punk', album: 'Random Access Memories', date: '2013', quality: 'FLAC' },
    { artist: 'Radiohead', album: 'OK Computer', date: '1997', quality: 'FLAC' },
    { artist: 'Gorillaz', album: 'Demon Days', date: '2005', quality: 'MP3' },
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
        <h2>Releases manquantes prioritaires</h2>
        <button style={{ 
          backgroundColor: 'var(--accent)', 
          color: 'white', 
          border: 'none', 
          padding: '8px 16px', 
          borderRadius: 'var(--radius)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: 600
        }}>
          <Search size={16} />
          Tout rechercher
        </button>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Artiste</th>
            <th>Album</th>
            <th>Année</th>
            <th>Qualité Souhaitée</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {recentMissing.map((item, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 600 }}>{item.artist}</td>
              <td>{item.album}</td>
              <td>{item.date}</td>
              <td>
                <span className={`${styles.statusBadge} ${item.quality === 'FLAC' ? styles.statusWanted : styles.statusMissing}`}>
                  {item.quality}
                </span>
              </td>
              <td>
                <button style={{ 
                  background: 'none', 
                  border: `1px solid var(--border)`, 
                  color: 'var(--foreground)',
                  padding: '4px 12px',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.8125rem'
                }}>
                  Lancer recherche
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
