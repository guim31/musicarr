'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Check, Database, Download, Move, RefreshCw, type LucideIcon } from 'lucide-react';
import Cover, { coverUrl } from '@/components/ui/Cover';
import ProgressTape from '@/components/ui/ProgressTape';
import { useActivity } from '@/context/ActivityContext';
import { useApi, useActivityFinished } from '@/hooks/useApi';
import { ACTIVITY_LABELS, type HistoryEntry } from '@/lib/ui/activity';
import { formatQuality, formatYear, isLossless, plural, timeAgo, tiltFor } from '@/lib/ui/format';
import styles from './Home.module.css';

interface LibraryInfo {
  path: string;
  stats: { artists: number; albums: number; tracks: number; formats: Record<string, number> };
}

interface AlbumRow {
  id: number;
  name: string;
  artist_name: string;
  album_artist?: string | null;
  quality?: string | null;
  release_date?: string | null;
}

interface MissingSummary {
  counts: { total: number; lost: number; neverOwned: number; albums: number };
}

const ICONS: Record<string, LucideIcon> = { download: Download, scan: Database, sync: RefreshCw, move: Move };

export default function Home() {
  const library = useApi<LibraryInfo>('/api/library');
  const recent = useApi<{ albums: AlbumRow[] }>('/api/albums?sortBy=recent&limit=16');
  const missing = useApi<MissingSummary>('/api/albums/missing?summary=1');
  const { active, recent: history, ready } = useActivity();
  // La date du « numéro » dépend du fuseau du navigateur : pas au rendu serveur.
  const [issueDate, setIssueDate] = useState('');

  useEffect(() => {
    setIssueDate(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/ 1 /, ' 1er '));
  }, []);

  useActivityFinished(() => {
    library.reload();
    recent.reload();
    missing.reload();
  });

  const stats = library.data?.stats;
  const albums = recent.data?.albums ?? [];
  const lossless = stats
    ? Object.entries(stats.formats).reduce((sum, [format, count]) => sum + (isLossless(format) ? count : 0), 0)
    : 0;
  const losslessPercent = stats?.albums ? Math.round((lossless / stats.albums) * 100) : 0;

  return (
    <div className={styles.home}>
      <section className={styles.hero}>
        <div className={styles.wall} aria-hidden="true">
          {albums.length > 0 &&
            Array.from({ length: 48 }, (_, index) => {
              const album = albums[index % albums.length];
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={index} src={coverUrl(album.id, undefined, 160)} alt="" decoding="async" onError={event => (event.currentTarget.style.visibility = 'hidden')} />
              );
            })}
        </div>
        <div className={styles.heroInner}>
          <p className={styles.issue}>
            <span className="tape">Le zine de la maison</span>
            {issueDate && <span className={`mono ${styles.issueDate}`}>{issueDate}</span>}
          </p>
          <h1 className={`display misprint ${styles.count}`}>
            {stats ? stats.albums.toLocaleString('fr-FR') : <span className="pulse">···</span>}
            <span className={styles.countUnit}>disques</span>
          </h1>
          {stats && (
            <p className={`mono ${styles.ticker}`}>
              {plural(stats.artists, 'artiste')} <span>★</span> {plural(stats.tracks, 'titre')} <span>★</span> {losslessPercent} % sans perte
            </p>
          )}
        </div>
      </section>

      {active.length > 0 && (
        <section className={styles.live} aria-label="En ce moment">
          <h2 className="tape tape-aqua">En ce moment</h2>
          <ul>
            {active.slice(0, 3).map(item => (
              <li key={item.id}>
                <Link href="/activity" className={styles.liveRow}>
                  <span className="mini-record" aria-hidden="true" />
                  <span className={styles.liveText}>
                    <strong className="clamp-1">{item.title}</strong>
                    <span className="mono muted clamp-1">{item.label}</span>
                    <ProgressTape percent={item.percent} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.crateSection} aria-labelledby="derniers-arrives">
        <header className={styles.sectionHead}>
          <h2 id="derniers-arrives" className="display">
            Derniers arrivés
          </h2>
          <Link href="/library" className={styles.more}>
            Tout le bac <ArrowUpRight size={16} />
          </Link>
        </header>
        <div className={styles.crate} tabIndex={0} aria-label="Derniers disques ajoutés, à faire défiler">
          {albums.length === 0 && !recent.loading && <p className="muted">La collection attend son premier disque.</p>}
          {recent.loading && Array.from({ length: 6 }, (_, index) => <div key={index} className={`${styles.crateItem} ${styles.crateSkeleton} skeleton`} />)}
          {albums.map(album => {
            const quality = formatQuality(album.quality);
            return (
              <Link key={album.id} href={`/library/album/${album.id}`} className={styles.crateItem}>
                <Cover albumId={album.id} name={album.name} artist={album.album_artist || album.artist_name} sizes="(max-width: 599px) 62vw, 200px" morph>
                  {quality && (
                    <span
                      className={`sticker ${isLossless(album.quality) ? 'sticker-flac' : ''} ${styles.crateSticker}`}
                      style={{ '--tilt': tiltFor(album.name, 12) } as React.CSSProperties}
                    >
                      {quality}
                    </span>
                  )}
                </Cover>
                <span className={styles.crateCaption}>
                  <strong className="clamp-1">{album.name}</strong>
                  <span className="mono muted clamp-1">
                    {album.album_artist || album.artist_name}
                    {album.release_date ? ` · ${formatYear(album.release_date)}` : ''}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <div className={styles.columns}>
        <section className={styles.tiles} aria-label="État de la collection">
          <Link href="/missing" className={styles.wanted}>
            <span className={`mono ${styles.wantedTop}`}>Avis de recherche</span>
            <span className={`display ${styles.wantedCount}`}>{missing.data ? missing.data.counts.total.toLocaleString('fr-FR') : '···'}</span>
            <span className={styles.wantedLabel}>
              {missing.data ? `sorties manquantes, dont ${plural(missing.data.counts.albums, 'album ou EP', 'albums ou EP')}` : 'sorties manquantes'}
            </span>
            <ArrowUpRight size={26} className={styles.wantedArrow} />
          </Link>

          <div className={styles.format}>
            <span className={`mono ${styles.formatTop}`}>Qualité de la collection</span>
            <span className={`display ${styles.formatValue}`}>{stats ? `${losslessPercent}%` : '···'}</span>
            <span className={styles.formatLabel}>{stats ? `${plural(lossless, 'disque')} sans perte, ${plural(stats.albums - lossless, 'autre')} à améliorer` : ''}</span>
            <span className={styles.formatBar} aria-hidden="true">
              <i style={{ width: `${losslessPercent}%` }} />
            </span>
            <Link href="/library?format=lossy" className={styles.formatLink}>
              Voir ceux à améliorer <ArrowUpRight size={15} />
            </Link>
          </div>
        </section>

        <section className={styles.feed} aria-labelledby="activite-recente">
          <header className={styles.sectionHead}>
            <h2 id="activite-recente" className="display">
              Du nouveau
            </h2>
            <Link href="/activity" className={styles.more}>
              Tout voir <ArrowUpRight size={16} />
            </Link>
          </header>
          {ready && history.length === 0 ? (
            <div className="empty">
              <p className="hand">Rien à signaler.</p>
              <p>Les téléchargements et les scans s'afficheront ici.</p>
            </div>
          ) : (
            <ol className={styles.feedList}>
              {history.slice(0, 6).map(entry => (
                <FeedRow key={entry.id} entry={entry} />
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function FeedRow({ entry }: { entry: HistoryEntry }) {
  const failed = entry.status === 'failed';
  const Icon = failed ? AlertTriangle : (ICONS[entry.type] ?? Check);
  return (
    <li className={styles.feedRow} data-failed={failed}>
      <span className={styles.feedIcon}>
        <Icon size={15} aria-hidden="true" />
      </span>
      <div className={styles.feedText}>
        <strong className="clamp-1">{entry.title}</strong>
        <span className="muted clamp-1">{entry.message || ACTIVITY_LABELS[entry.type]}</span>
      </div>
      <span className={`mono ${styles.feedTime}`}>{timeAgo(entry.timestamp)}</span>
    </li>
  );
}
