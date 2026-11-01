'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, HardDrive, RefreshCw, Search, Tags } from 'lucide-react';
import OrganizeFilesModal from '@/components/modals/OrganizeFilesModal';
import SearchModal from '@/components/modals/SearchModal';
import TagEditorModal from '@/components/modals/TagEditorModal';
import Cover, { coverUrl } from '@/components/ui/Cover';
import { useToast } from '@/context/ToastContext';
import { useActivityFinished, useApi } from '@/hooks/useApi';
import { forget } from '@/hooks/useListMemory';
import { postJson } from '@/lib/ui/api';
import { formatDuration, formatQuality, formatRuntime, formatYear, isLossless, plural } from '@/lib/ui/format';
import styles from './AlbumDetail.module.css';

export interface AlbumDetail {
  id: number;
  name: string;
  artist_id: number;
  artist_name: string;
  album_artist?: string | null;
  release_date?: string | null;
  quality?: string | null;
  status: string;
  path?: string | null;
  mbid?: string | null;
  deezer_id?: string | null;
  discogs_id?: string | null;
  barcode?: string | null;
  label?: string | null;
  type?: string | null;
  metadata?: {
    deezerId?: string;
    sampleRate?: number;
    genre?: string;
    bitrate?: number;
  };
}

export interface TrackRow {
  id: number | string;
  title: string;
  artist?: string | null;
  number?: number | null;
  track_total?: number | null;
  disc?: number | null;
  disc_total?: number | null;
  duration?: number | null;
  quality?: string | null;
  bitrate?: number | null;
  bpm?: number | null;
  isrc?: string | null;
  path?: string | null;
  isLocal: boolean;
}

export default function AlbumDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const album = useApi<AlbumDetail>(`/api/albums/${id}`);
  const tracks = useApi<TrackRow[]>(`/api/albums/${id}/tracks`);
  const { showToast } = useToast();

  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [organizeModalOpen, setOrganizeModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [coverVersion, setCoverVersion] = useState<number | undefined>();

  const refresh = () => {
    album.reload();
    tracks.reload();
    // Le titre et la pochette ont pu changer : la liste mémorisée n'est plus juste.
    forget('library:albums');
  };

  useActivityFinished(detail => {
    if (detail.album_id === Number(id) || detail.artist_id === album.data?.artist_id || detail.type === 'scan') refresh();
  });

  const handleRename = async () => {
    setRenaming(true);
    try {
      await postJson(`/api/albums/${id}/rename`);
      showToast('Les fichiers sont rangés.', 'success');
      setOrganizeModalOpen(false);
      refresh();
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setRenaming(false);
    }
  };

  const info = album.data;
  const rows = tracks.data ?? [];
  const localTracks = rows.filter(track => track.isLocal);
  const runtime = rows.reduce((sum, track) => sum + (track.duration ?? 0), 0);
  const owned = info?.status === 'downloaded';
  const quality = formatQuality(info?.quality);
  const bitrates = localTracks.map(track => track.bitrate ?? 0).filter(Boolean);
  const averageBitrate = bitrates.length ? Math.round(bitrates.reduce((a, b) => a + b, 0) / bitrates.length) : 0;
  const discs = [...new Set(rows.map(track => track.disc || 1))];

  if (!album.loading && !info) {
    return (
      <div className="page empty">
        <p className="hand">Ce disque n'est plus dans le bac.</p>
        <Link href="/library" className="btn">
          <ArrowLeft size={18} />
          Retour à la collection
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.album}>
      {/* L'ambiance de la pochette déborde sur la page */}
      <div className={styles.aura} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverUrl(id, coverVersion, 160)} alt="" onError={event => (event.currentTarget.style.display = 'none')} />
      </div>

      <div className={styles.inner}>
        {info && (
          <Link href={`/library/artist/${info.artist_id}`} className={styles.back}>
            <ArrowLeft size={16} />
            <span className="clamp-1">{info.artist_name}</span>
          </Link>
        )}

        <header className={styles.hero}>
          <div className={styles.sleeve}>
            <span className={`${styles.tapePiece} ${styles.tapeA}`} aria-hidden="true" />
            <span className={`${styles.tapePiece} ${styles.tapeB}`} aria-hidden="true" />
            <Cover albumId={id} version={coverVersion} name={info?.name ?? ''} artist={info?.artist_name} morph eager />
          </div>

          <div className={styles.intro}>
            {info ? (
              <>
                <Link href={`/library/artist/${info.artist_id}`} className={`mono ${styles.artist}`}>
                  {info.album_artist || info.artist_name}
                </Link>
                <h1 className={`display misprint ${styles.title}`} data-long={info.name.length > 28}>
                  {info.name}
                </h1>
                <p className={`mono ${styles.meta}`}>
                  {[
                    formatYear(info.release_date),
                    rows.length ? plural(rows.length, 'titre') : '',
                    formatRuntime(runtime),
                  ]
                    .filter(Boolean)
                    .join(' ★ ')}
                </p>
                <div className={styles.badges}>
                  {quality && <span className={`sticker ${isLossless(info.quality) ? 'sticker-flac' : ''}`}>{quality}</span>}
                  {averageBitrate > 0 && <span className={`sticker sticker-flat ${styles.flat}`}>{averageBitrate} kbps</span>}
                  {!owned && <span className="sticker sticker-hot">Manquant</span>}
                </div>

                <div className={styles.actions}>
                  {!owned ? (
                    <button type="button" className="btn btn-primary" onClick={() => setSearchOpen(true)}>
                      <Search size={18} />
                      Chercher ce disque
                    </button>
                  ) : (
                    <>
                      <button type="button" className="btn" onClick={() => setTagModalOpen(true)} disabled={localTracks.length === 0}>
                        <Tags size={18} />
                        Éditer les tags
                      </button>
                      <button type="button" className="btn" onClick={() => setOrganizeModalOpen(true)} disabled={renaming}>
                        {renaming ? <RefreshCw className="spin" size={18} /> : <HardDrive size={18} />}
                        {renaming ? 'Rangement…' : 'Ranger les fichiers'}
                      </button>
                      <button type="button" className="btn btn-quiet" onClick={() => setSearchOpen(true)}>
                        <Search size={18} />
                        Meilleure version
                      </button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className={`skeleton ${styles.introSkeleton}`} />
            )}
          </div>
        </header>

        <section className={styles.setlist} aria-label="Liste des titres">
          <span className={`${styles.tapePiece} ${styles.tapeC}`} aria-hidden="true" />
          <h2 className={`hand ${styles.setlistTitle}`}>Setlist</h2>

          {tracks.loading ? (
            <p className={styles.setlistEmpty}>On déroule la liste…</p>
          ) : rows.length === 0 ? (
            <p className={styles.setlistEmpty}>{tracks.error ?? 'Aucun titre connu pour ce disque.'}</p>
          ) : (
            discs.map(disc => (
              <div key={disc} className={styles.disc}>
                {discs.length > 1 && <h3 className={`hand ${styles.discTitle}`}>Disque {disc}</h3>}
                <ol className={styles.tracks}>
                  {rows
                    .filter(track => (track.disc || 1) === disc)
                    .map(track => (
                      <li key={track.id} className={styles.track} data-missing={!track.isLocal}>
                        <span className={styles.number}>{track.number ? String(track.number).padStart(2, '0') : '··'}</span>
                        <span className={styles.trackName}>
                          <span>{track.title}</span>
                          {track.artist && track.artist.toUpperCase() !== (info?.artist_name ?? '').toUpperCase() && (
                            <small>{track.artist}</small>
                          )}
                        </span>
                        <span className={styles.trackTech}>
                          {track.isLocal ? (
                            <>
                              {formatQuality(track.quality)}
                              {track.bitrate ? ` ${track.bitrate}` : ''}
                            </>
                          ) : (
                            'absent'
                          )}
                        </span>
                        <span className={styles.duration}>{formatDuration(track.duration)}</span>
                        {track.isLocal && <Check size={14} className={styles.tick} aria-label="Sur le disque" />}
                      </li>
                    ))}
                </ol>
              </div>
            ))
          )}
        </section>

        {info && (
          <details className={styles.tech}>
            <summary className="mono">Fiche technique</summary>
            <dl>
              {info.path && <Fact label="Dossier" value={info.path} />}
              {info.label && <Fact label="Label" value={info.label} />}
              {info.barcode && <Fact label="Code-barres" value={info.barcode} />}
              {info.metadata?.genre && <Fact label="Genre" value={info.metadata.genre} />}
              {info.metadata?.sampleRate ? <Fact label="Échantillonnage" value={`${info.metadata.sampleRate.toLocaleString('fr-FR')} Hz`} /> : null}
              {info.mbid && <Fact label="MusicBrainz" value={info.mbid} />}
              {(info.deezer_id || info.metadata?.deezerId) && <Fact label="Deezer" value={String(info.deezer_id || info.metadata?.deezerId)} />}
              {info.discogs_id && <Fact label="Discogs" value={info.discogs_id} />}
            </dl>
          </details>
        )}
      </div>

      {info && owned && (
        <>
          <TagEditorModal
            isOpen={tagModalOpen}
            onClose={() => setTagModalOpen(false)}
            album={info}
            tracks={localTracks}
            onSaveSuccess={() => {
              setCoverVersion(Date.now());
              refresh();
            }}
          />
          <OrganizeFilesModal
            isOpen={organizeModalOpen}
            onClose={() => setOrganizeModalOpen(false)}
            albumId={info.id}
            onConfirm={handleRename}
            loading={renaming}
            albumName={info.name}
          />
        </>
      )}

      {info && (
        <SearchModal
          isOpen={searchOpen}
          onClose={() => setSearchOpen(false)}
          query={`${info.artist_name} ${info.name}`}
          albumId={info.id}
        />
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.fact}>
      <dt className="mono">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
