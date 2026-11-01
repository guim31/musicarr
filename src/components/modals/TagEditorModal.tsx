'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Globe, ImagePlus, Layers, RefreshCw, Save, Search, Sparkles } from 'lucide-react';
import Sheet from '@/components/ui/Sheet';
import { useConfirm } from '@/context/ConfirmContext';
import { useToast } from '@/context/ToastContext';
import { api, postJson } from '@/lib/ui/api';
import type { AlbumDetail, TrackRow } from '@/app/library/album/[id]/page';
import styles from './Modals.module.css';

interface TrackEdit {
  trackId: number | string;
  title: string;
  number: number;
  trackTotal?: number | null;
  disc: number;
  discTotal?: number | null;
  path: string;
  artist: string;
  albumArtist: string;
  album: string;
  year: string;
  genre: string;
  bpm: number | string;
  isrc: string;
  barcode: string;
  label: string;
}

type BulkKey = 'artist' | 'albumArtist' | 'album' | 'year' | 'genre' | 'label';

const BULK_FIELDS: { key: BulkKey; label: string; placeholder: string; hint?: string }[] = [
  { key: 'artist', label: 'Artiste des pistes', placeholder: 'Artiste commun', hint: 'Sur une compilation, l’artiste propre à chaque titre.' },
  { key: 'albumArtist', label: 'Artiste de l’album', placeholder: 'VARIOUS ARTISTS…', hint: 'Regroupe le disque, et définit son dossier de stockage.' },
  { key: 'album', label: 'Album', placeholder: 'Nom de l’album' },
  { key: 'year', label: 'Année', placeholder: '2024' },
  { key: 'genre', label: 'Genre', placeholder: 'Punk, ska…' },
  { key: 'label', label: 'Label', placeholder: 'Fat Wreck…' },
];

interface TagEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  album: AlbumDetail;
  /** Pistes présentes sur le disque : les seules dont on peut écrire les tags. */
  tracks: TrackRow[];
  onSaveSuccess: () => void;
}

function toEdits(album: AlbumDetail, tracks: TrackRow[]): TrackEdit[] {
  const year = album.release_date?.substring(0, 4) || '';
  return tracks.map(track => ({
    trackId: track.id,
    title: track.title,
    number: track.number ?? 0,
    trackTotal: track.track_total,
    disc: track.disc || 1,
    discTotal: track.disc_total,
    path: track.path ?? '',
    artist: track.artist || album.artist_name,
    albumArtist: album.album_artist || '',
    album: album.name,
    year,
    genre: album.metadata?.genre || '',
    bpm: track.bpm || '',
    isrc: track.isrc || '',
    barcode: album.barcode || '',
    label: album.label || '',
  }));
}

export default function TagEditorModal({ isOpen, onClose, album, tracks, onSaveSuccess }: TagEditorModalProps) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestingCover, setSuggestingCover] = useState(false);
  const [edits, setEdits] = useState<TrackEdit[]>([]);
  const [bulk, setBulk] = useState<Record<BulkKey, string>>({ artist: '', albumArtist: '', album: '', year: '', genre: '', label: '' });
  const [coverPreview, setCoverPreview] = useState('');
  const [newCover, setNewCover] = useState<string | null>(null);
  const [coverUrlDraft, setCoverUrlDraft] = useState('');
  const snapshot = useRef('');

  useEffect(() => {
    if (!isOpen) return;
    const initial = toEdits(album, tracks);
    setEdits(initial);
    snapshot.current = JSON.stringify(initial);
    setBulk({
      artist: album.artist_name,
      albumArtist: album.album_artist || '',
      album: album.name,
      year: album.release_date?.substring(0, 4) || '',
      genre: album.metadata?.genre || '',
      label: album.label || '',
    });
    setCoverPreview(`/api/albums/${album.id}/cover?t=${Date.now()}`);
    setNewCover(null);
    setCoverUrlDraft('');
  }, [isOpen, album, tracks]);

  const requestClose = async () => {
    const dirty = JSON.stringify(edits) !== snapshot.current || newCover !== null;
    if (dirty) {
      const leave = await confirm({
        title: 'Abandonner les changements ?',
        message: 'Les modifications non enregistrées seront perdues.',
        confirmLabel: 'Abandonner',
        cancelLabel: 'Continuer',
        danger: true,
      });
      if (!leave) return;
    }
    onClose();
  };

  const updateTrack = <K extends keyof TrackEdit>(index: number, field: K, value: TrackEdit[K]) => {
    setEdits(current => current.map((edit, position) => (position === index ? { ...edit, [field]: value } : edit)));
  };

  const applyBulk = (field: BulkKey) => {
    const value = field === 'artist' || field === 'albumArtist' ? bulk[field].toUpperCase() : bulk[field];
    setEdits(current => current.map(edit => ({ ...edit, [field]: value })));
    showToast(`« ${value} » appliqué à toutes les pistes.`, 'success');
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setNewCover(base64);
      setCoverPreview(base64);
    };
    reader.readAsDataURL(file);
  };

  const applyCoverUrl = () => {
    const url = coverUrlDraft.trim();
    if (!url) return;
    setNewCover(url);
    setCoverPreview(url);
  };

  const cleanTitles = () => {
    const cleaned = edits.map(edit => {
      let { title, number, disc } = edit;

      const inTitle = title.match(/^([0-9]+)[\s\-_.]+(.*)/);
      if (inTitle) {
        number = parseInt(inTitle[1], 10);
        title = inTitle[2];
      }

      const parts = edit.path.split('/');
      const fileName = parts.pop() || '';
      const parentDir = parts.pop() || '';

      const inFile = fileName.match(/^(?:([0-9]+)\s*-?\s*)?(.+)\.(?:flac|mp3|m4a|wav)$/i);
      if (inFile) {
        // Sans préfixe numérique dans le nom de fichier, ne pas écrire NaN.
        if (!number && inFile[1]) number = parseInt(inFile[1], 10);
        if (!title) title = inFile[2];
      }

      const inFolder = parentDir.match(/(?:CD|Disc|Disque)\s*([0-9]+)/i);
      if (inFolder) disc = parseInt(inFolder[1], 10);

      title = title
        .replace(/\.(flac|mp3|m4a|wav)$/i, '')
        .replace(/_/g, ' ')
        .replace(/^[0-9]+[\s\-_.]+/, '')
        .trim();

      return { ...edit, title, number, disc };
    });

    cleaned.sort((a, b) => (a.disc !== b.disc ? a.disc - b.disc : a.number - b.number));
    setEdits(cleaned);
    showToast('Titres, numéros et disques remis d’équerre.', 'success');
  };

  const suggestTags = async () => {
    setSuggesting(true);
    try {
      const data = await api<{ suggestions: { number: number; title: string; artist?: string }[] }>(`/api/albums/${album.id}/suggest-tags`);
      const next = [...edits];
      let matches = 0;
      // Par numéro de piste d'abord, le plus fiable…
      for (const suggestion of data.suggestions) {
        const index = next.findIndex(edit => edit.number === suggestion.number);
        if (index === -1) continue;
        next[index] = { ...next[index], title: suggestion.title, artist: suggestion.artist?.toUpperCase() ?? next[index].artist };
        matches += 1;
      }
      // …et par position si les fichiers ne sont pas encore numérotés.
      if (matches === 0) {
        data.suggestions.forEach((suggestion, index) => {
          if (!next[index]) return;
          next[index] = { ...next[index], title: suggestion.title, artist: suggestion.artist?.toUpperCase() ?? next[index].artist, number: suggestion.number };
          matches += 1;
        });
      }
      setEdits(next);
      showToast(`${matches} piste${matches > 1 ? 's' : ''} pré-remplie${matches > 1 ? 's' : ''}.`, 'success');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setSuggesting(false);
    }
  };

  const suggestCover = async () => {
    setSuggestingCover(true);
    try {
      const data = await api<{ coverUrl: string }>(`/api/albums/${album.id}/suggest-cover`);
      setNewCover(data.coverUrl);
      setCoverPreview(data.coverUrl);
      showToast('Pochette trouvée. Enregistrez pour l’appliquer.', 'success');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setSuggestingCover(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await postJson(`/api/albums/${album.id}/tags`, { tracks: edits, cover: newCover });
      showToast('Tags écrits dans les fichiers.', 'success');
      onSaveSuccess();
      onClose();
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={isOpen}
      onClose={requestClose}
      dismissible={!saving}
      size="full"
      title="Éditer les tags"
      subtitle={album.name}
      footer={
        <>
          <span className={styles.footerNote}>
            <AlertTriangle size={14} />
            Écrit directement dans les fichiers.
          </span>
          <button type="button" className="btn btn-quiet" onClick={requestClose} disabled={saving}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <RefreshCw className="spin" size={18} /> : <Save size={18} />}
            Enregistrer
          </button>
        </>
      }
    >
      <div className={styles.editor}>
        <div className={styles.editorSide}>
          <section className={styles.editorGroup}>
            <h3>Pochette</h3>
            <div className={styles.coverRow}>
              <div className={styles.coverPreview}>
                {coverPreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverPreview} alt={`Pochette de ${album.name}`} />
                )}
              </div>
              <div className={styles.coverTools}>
                <span className={`btn btn-sm btn-quiet ${styles.fileInput}`}>
                  <ImagePlus size={15} />
                  Choisir
                  <input type="file" accept="image/*" onChange={handleFile} aria-label="Choisir une image de pochette" />
                </span>
                <button type="button" className="btn btn-sm btn-quiet" onClick={suggestCover} disabled={suggestingCover}>
                  {suggestingCover ? <RefreshCw className="spin" size={15} /> : <Search size={15} />}
                  Chercher
                </button>
                <input
                  className="input"
                  type="url"
                  placeholder="ou coller une URL"
                  aria-label="URL de la pochette"
                  value={coverUrlDraft}
                  onChange={event => setCoverUrlDraft(event.target.value)}
                  onBlur={applyCoverUrl}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      applyCoverUrl();
                    }
                  }}
                />
              </div>
            </div>
          </section>

          <section className={styles.editorGroup}>
            <h3>Automatique</h3>
            <div className={styles.magic}>
              <button type="button" className="btn btn-sm" onClick={cleanTitles}>
                <Sparkles size={15} />
                Nettoyer les titres
              </button>
              <button type="button" className="btn btn-sm" onClick={suggestTags} disabled={suggesting}>
                {suggesting ? <RefreshCw className="spin" size={15} /> : <Globe size={15} />}
                Suggérer via Internet
              </button>
            </div>
          </section>

          <section className={styles.editorGroup}>
            <h3>Pour tout le disque</h3>
            {BULK_FIELDS.map(field => (
              <div key={field.key} className={styles.bulkField}>
                <label className="label" htmlFor={`bulk-${field.key}`}>
                  {field.label}
                </label>
                <div className={styles.bulkRow}>
                  <input
                    id={`bulk-${field.key}`}
                    className="input"
                    type="text"
                    value={bulk[field.key]}
                    placeholder={field.placeholder}
                    onChange={event => setBulk(current => ({ ...current, [field.key]: event.target.value }))}
                  />
                  <button type="button" className="btn btn-icon btn-quiet" onClick={() => applyBulk(field.key)} aria-label={`Appliquer ${field.label} à toutes les pistes`} title="Appliquer à toutes les pistes">
                    <Layers size={18} />
                  </button>
                </div>
                {field.hint && <p className="hint">{field.hint}</p>}
              </div>
            ))}
          </section>
        </div>

        <section className={styles.editorGroup}>
          <h3>Pistes ({edits.length})</h3>
          {edits.map((edit, index) => (
            <div key={edit.trackId} className={styles.trackCard}>
              <div className={styles.cell}>
                <label htmlFor={`disc-${index}`}>CD</label>
                <input id={`disc-${index}`} className="input" inputMode="numeric" value={edit.disc || 1} onChange={event => updateTrack(index, 'disc', parseInt(event.target.value, 10) || 1)} />
              </div>
              <div className={styles.cell}>
                <label htmlFor={`number-${index}`}>N°</label>
                <input id={`number-${index}`} className="input" inputMode="numeric" value={edit.number || ''} onChange={event => updateTrack(index, 'number', parseInt(event.target.value, 10) || 0)} />
              </div>
              <div className={`${styles.cell} ${styles.cellTitle}`}>
                <label htmlFor={`title-${index}`}>Titre</label>
                <input id={`title-${index}`} className="input" value={edit.title} onChange={event => updateTrack(index, 'title', event.target.value)} />
              </div>
              <div className={`${styles.cell} ${styles.cellWide}`}>
                <label htmlFor={`artist-${index}`}>Artiste de la piste</label>
                <input id={`artist-${index}`} className="input" value={edit.artist} onChange={event => updateTrack(index, 'artist', event.target.value)} />
              </div>
              <div className={`${styles.cell} ${styles.cellWide}`}>
                <label htmlFor={`album-artist-${index}`}>Artiste de l’album</label>
                <input id={`album-artist-${index}`} className="input" value={edit.albumArtist} onChange={event => updateTrack(index, 'albumArtist', event.target.value)} />
              </div>
            </div>
          ))}
        </section>
      </div>
    </Sheet>
  );
}
