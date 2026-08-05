'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Save, 
  RefreshCw, 
  Edit3, 
  Layers,
  Check,
  AlertTriangle,
  Music,
  User,
  Disc,
  Calendar,
  Tag,
  Upload,
  Sparkles,
  Info,
  Globe,
  Image as ImageIcon,
  Search
} from 'lucide-react';
import styles from './TagEditorModal.module.css';
import { useToast } from '@/context/ToastContext';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';

interface Track {
  id: number;
  title: string;
  artist?: string;
  number: number;
  track_total?: number;
  disc: number;
  disc_total?: number;
  quality: string;
  duration?: number;
  bpm?: number;
  isrc?: string;
  path: string;
}

interface Album {
  id: number;
  name: string;
  artist_name: string;
  album_artist?: string;
  release_date?: string;
  barcode?: string;
  label?: string;
  metadata?: {
    genre?: string;
  };
}

interface TagEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  album: Album;
  tracks: Track[];
  onSaveSuccess: () => void;
}

export default function TagEditorModal({ isOpen, onClose, album, tracks, onSaveSuccess }: TagEditorModalProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestingCover, setSuggestingCover] = useState(false);
  const [trackEdits, setTrackEdits] = useState<any[]>([]);
  const [bulkData, setBulkData] = useState({
    artist: '',
    albumArtist: '',
    album: '',
    year: '',
    genre: '',
    label: '',
    barcode: ''
  });
  const [coverPreview, setCoverPreview] = useState<string>(`/api/albums/${album.id}/cover`);
  const [newCover, setNewCover] = useState<string | null>(null);

  // Photo de l'état initial pour détecter les modifications non sauvegardées
  const initialSnapshot = React.useRef('');

  const requestClose = React.useCallback(() => {
    const dirty = JSON.stringify(trackEdits) !== initialSnapshot.current || newCover !== null;
    if (dirty && !confirm('Des modifications non sauvegardées seront perdues. Fermer quand même ?')) {
      return;
    }
    onClose();
  }, [trackEdits, newCover, onClose]);

  // Pas de fermeture pendant l'écriture des tags
  useEscapeToClose(isOpen && !loading, requestClose);

  useEffect(() => {
    if (isOpen) {
      const mappedEdits = tracks.map((t: any) => ({
        trackId: t.id,
        title: t.title,
        number: t.number,
        trackTotal: t.track_total,
        disc: t.disc || 1,
        discTotal: t.disc_total,
        path: t.path,
        artist: t.artist || album.artist_name,
        albumArtist: album.album_artist || '',
        album: album.name,
        year: album.release_date?.substring(0, 4) || '',
        genre: album.metadata?.genre || '',
        bpm: t.bpm || '',
        isrc: t.isrc || '',
        barcode: album.barcode || '',
        label: album.label || ''
      }));
      setTrackEdits(mappedEdits);
      initialSnapshot.current = JSON.stringify(mappedEdits);
      setBulkData({
        artist: album.artist_name,
        albumArtist: album.album_artist || '',
        album: album.name,
        year: album.release_date?.substring(0, 4) || '',
        genre: album.metadata?.genre || '',
        label: album.label || '',
        barcode: album.barcode || ''
      });
      setCoverPreview(`/api/albums/${album.id}/cover?t=${Date.now()}`);
      setNewCover(null);
    }
  }, [isOpen, tracks, album]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setNewCover(base64);
        setCoverPreview(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTrackChange = (index: number, field: string, value: any) => {
    const newEdits = [...trackEdits];
    newEdits[index] = { ...newEdits[index], [field]: value };
    setTrackEdits(newEdits);
  };

  const applyBulk = (field: string) => {
    let value = (bulkData as any)[field];
    if (field === 'artist' || field === 'albumArtist') {
      value = value.toUpperCase();
    }
    const newEdits = trackEdits.map(t => ({ ...t, [field]: value }));
    setTrackEdits(newEdits);
    showToast(`Appliqué "${value}" à toutes les pistes`, "success");
  };

  const cleanTitles = () => {
    const newEdits = trackEdits.map(t => {
      let title = t.title;
      let number = t.number;
      let disc = t.disc;

      // 1. Tenter d'extraire depuis le titre actuel de l'UI
      const titleMatch = title.match(/^([0-9]+)[\s-_.]+(.*)/);
      if (titleMatch) {
        number = parseInt(titleMatch[1]);
        title = titleMatch[2];
      }

      // 2. Tenter d'extraire le numéro ET le disque depuis le NOM DU FICHIER / CHEMIN
      const pathParts = t.path.split('/');
      const fileName = pathParts.pop() || '';
      const parentDir = pathParts.pop() || '';

      // Extraction numéro piste depuis nom fichier
      const fileMatch = fileName.match(/^(?:([0-9]+)\s*-?\s*)?(.+)\.(?:flac|mp3|m4a|wav)$/i);
      if (fileMatch) {
         if (!number || number === 0) number = parseInt(fileMatch[1]);
         if (!title || title === t.title) title = fileMatch[2];
      }

      // Extraction numéro disque depuis dossier parent (CD 01, Disc 2, etc.)
      const discMatch = parentDir.match(/(?:CD|Disc|Disque)\s*([0-9]+)/i);
      if (discMatch) {
        disc = parseInt(discMatch[1]);
      }

      // Nettoyage final du titre : extension et underscores
      title = title.replace(/\.(flac|mp3|m4a|wav)$/i, '')
                  .replace(/_/g, ' ')
                  .replace(/^[0-9]+[\s-_.]+/, '') // Enlever les préfixes numériques résiduels
                  .trim();

      return { ...t, title, number, disc };
    });

    // Trier pour avoir un affichage cohérent (Disque puis Piste)
    newEdits.sort((a, b) => {
      if (a.disc !== b.disc) return a.disc - b.disc;
      return a.number - b.number;
    });

    setTrackEdits(newEdits);
    showToast("Titres, numéros et disques synchronisés !", "success");
  };
  
  const handleSuggestTags = async () => {
    setSuggesting(true);
    try {
      const res = await fetch(`/api/albums/${album.id}/suggest-tags`);
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Impossible de récupérer des suggestions.");
      
      const suggestions = data.suggestions;
      const newEdits = [...trackEdits];
      
      // Tentative de matching par numéro de piste (plus fiable)
      let matches = 0;
      suggestions.forEach((s: any) => {
        const trackIdx = newEdits.findIndex(t => t.number === s.number);
        if (trackIdx !== -1) {
          newEdits[trackIdx] = { 
            ...newEdits[trackIdx], 
            title: s.title,
            artist: s.artist?.toUpperCase() 
          };
          matches++;
        }
      });

      // Si pas de match par numéro (ex: fichiers pas encore numérotés), on fait par index
      if (matches === 0) {
        suggestions.forEach((s: any, idx: number) => {
          if (newEdits[idx]) {
            newEdits[idx] = { 
              ...newEdits[idx], 
              title: s.title,
              artist: s.artist?.toUpperCase(),
              number: s.number 
            };
            matches++;
          }
        });
      }

      setTrackEdits(newEdits);
      showToast(`${matches} pistes pré-remplies via Internet !`, "success");
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSuggesting(false);
    }
  };

  const handleSuggestCover = async () => {
    setSuggestingCover(true);
    try {
      const res = await fetch(`/api/albums/${album.id}/suggest-cover`);
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Impossible de trouver une pochette.");
      
      setNewCover(data.coverUrl);
      setCoverPreview(data.coverUrl);
      showToast("Pochette trouvée et appliquée !", "success");
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSuggestingCover(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/albums/${album.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tracks: trackEdits,
          cover: newCover
        })
      });
      
      const data = await res.json();
      if (data.success) {
        showToast("Tags mis à jour avec succès !", "success");
        onSaveSuccess();
        onClose();
      } else {
        throw new Error(data.message || "Erreur lors de la sauvegarde");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={loading ? undefined : requestClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Éditeur de tags ID3">
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <Edit3 size={20} color="var(--accent)" />
            <h3>Éditeur de Tags ID3</h3>
          </div>
          <button className={styles.closeBtn} onClick={requestClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>

        <div className={styles.editorBody}>
          {/* COLONNE GAUCHE: ACTIONS DE MASSE */}
          <div className={styles.sidePanel}>
            <div className={styles.bulkActions}>
              <div className={styles.bulkItem}>
                <label>
                  <User size={14} /> Artiste Piste
                  <div className={styles.tooltipContainer}>
                    <Info size={12} className={styles.infoIcon} style={{ marginLeft: '4px' }} />
                    <div className={`${styles.tooltip} ${styles.tooltipRight}`}>
                      <strong>Compilations :</strong> Mettez ici l'artiste spécifique de chaque chanson.<br/><br/>
                      <em>Ex : Daft Punk</em>
                    </div>
                  </div>
                </label>
                <div className={styles.inputGroup}>
                  <input 
                    type="text" 
                    value={bulkData.artist} 
                    onChange={e => setBulkData({...bulkData, artist: e.target.value})}
                    placeholder="Artiste commun..."
                  />
                  <button onClick={() => applyBulk('artist')} title="Appliquer à tout">
                    <Layers size={14} />
                  </button>
                </div>
              </div>
              <div className={styles.bulkItem}>
                <label>
                  <Sparkles size={14} color="var(--accent)" /> Artiste de l'Album
                  <div className={styles.tooltipContainer}>
                    <Info size={12} className={styles.infoIcon} style={{ marginLeft: '4px' }} />
                    <div className={`${styles.tooltip} ${styles.tooltipRight}`}>
                      <strong>Compilations :</strong> Mettez ici <strong>VARIOUS ARTISTS</strong> pour regrouper l'album.<br/><br/>
                      C'est ce qui définit le dossier de stockage.
                    </div>
                  </div>
                </label>
                <div className={styles.inputGroup}>
                  <input 
                    type="text" 
                    value={bulkData.albumArtist} 
                    onChange={e => setBulkData({...bulkData, albumArtist: e.target.value})}
                    placeholder="VARIOUS ARTISTS, etc."
                  />
                  <button onClick={() => applyBulk('albumArtist')} title="Appliquer à tout">
                    <Layers size={14} />
                  </button>
                </div>
              </div>
              <div className={styles.bulkItem}>
                <label><Disc size={14} /> Album</label>
                <div className={styles.inputGroup}>
                  <input 
                    type="text" 
                    value={bulkData.album} 
                    onChange={e => setBulkData({...bulkData, album: e.target.value})}
                    placeholder="Nom de l'album..."
                  />
                  <button onClick={() => applyBulk('album')} title="Appliquer à tout">
                    <Layers size={14} />
                  </button>
                </div>
              </div>
              <div className={styles.bulkItem}>
                <label><Calendar size={14} /> Année</label>
                <div className={styles.inputGroup}>
                  <input 
                    type="text" 
                    value={bulkData.year} 
                    onChange={e => setBulkData({...bulkData, year: e.target.value})}
                    placeholder="2024"
                  />
                  <button onClick={() => applyBulk('year')} title="Appliquer à tout">
                    <Layers size={14} />
                  </button>
                </div>
              </div>
              <div className={styles.bulkItem}>
                <label><Tag size={14} /> Genre</label>
                <div className={styles.inputGroup}>
                  <input 
                    type="text" 
                    value={bulkData.genre} 
                    onChange={e => setBulkData({...bulkData, genre: e.target.value})}
                    placeholder="Rock, Jazz..."
                  />
                  <button onClick={() => applyBulk('genre')} title="Appliquer à tout">
                    <Layers size={14} />
                  </button>
                </div>
              </div>
              <div className={styles.bulkItem}>
                <label><Music size={14} /> Label</label>
                <div className={styles.inputGroup}>
                  <input 
                    type="text" 
                    value={bulkData.label} 
                    onChange={e => setBulkData({...bulkData, label: e.target.value})}
                    placeholder="Universal, Sony..."
                  />
                  <button onClick={() => applyBulk('label')} title="Appliquer à tout">
                    <Layers size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* COLONNE MILIEU: TABLEAU */}
          <div className={styles.scrollArea}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>CD</th>
                  <th style={{ width: '70px', textAlign: 'center' }}>#</th>
                  <th style={{ width: '35%' }}>Titre</th>
                  <th style={{ width: '30%' }}>
                    Artiste Piste
                  </th>
                  <th style={{ width: '30%' }}>
                    Artiste Album
                  </th>
                </tr>
              </thead>
              <tbody>
                {trackEdits.map((edit, idx) => (
                  <tr key={edit.trackId}>
                    <td style={{ textAlign: 'center' }}>
                      <input 
                        className={styles.cellInput}
                        style={{ textAlign: 'center', opacity: 0.7 }}
                        type="text" 
                        value={edit.disc || 1} 
                        onChange={e => handleTrackChange(idx, 'disc', parseInt(e.target.value) || 1)}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input 
                        className={styles.cellInput}
                        style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--accent)' }}
                        type="text" 
                        value={edit.number || ''} 
                        onChange={e => handleTrackChange(idx, 'number', parseInt(e.target.value) || 0)}
                      />
                    </td>
                    <td>
                      <input 
                        className={styles.cellInput}
                        type="text" 
                        value={edit.title} 
                        onChange={e => handleTrackChange(idx, 'title', e.target.value)}
                      />
                    </td>
                    <td>
                      <input 
                        className={styles.cellInput}
                        type="text" 
                        value={edit.artist} 
                        onChange={e => handleTrackChange(idx, 'artist', e.target.value)}
                      />
                    </td>
                    <td>
                      <input 
                        className={styles.cellInput}
                        type="text" 
                        value={edit.albumArtist} 
                        onChange={e => handleTrackChange(idx, 'albumArtist', e.target.value)}
                        placeholder="Artiste Album..."
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* COLONNE DROITE: COVER ET BOUTONS INTELLIGENTS */}
          <div className={styles.rightPanel}>
            <div className={styles.coverSection}>
              <div className={styles.coverWrapper}>
                <img src={coverPreview} alt="Album Cover" className={styles.previewImage} />
                <div className={styles.coverOverlay}>
                  <label className={styles.uploadLabel}>
                    <Upload size={24} />
                    <span>Changer</span>
                    <input type="file" accept="image/*" onChange={handleFileChange} hidden />
                  </label>
                </div>
              </div>
              
              <button 
                className={`${styles.cleanBtn} ${styles.smallBtn}`} 
                onClick={handleSuggestCover}
                disabled={suggestingCover}
              >
                {suggestingCover ? <RefreshCw className={styles.spin} size={14} /> : <Search size={14} />}
                Chercher Pochette
              </button>

              <div className={styles.coverUrlInput}>
                <label>URL de la pochette</label>
                <div className={styles.inputGroup}>
                  <input
                    type="text"
                    placeholder="https://..."
                    onBlur={e => {
                      const url = e.target.value.trim();
                      if (url) {
                        setNewCover(url);
                        setCoverPreview(url);
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                  />
                </div>
              </div>
            </div>

            <div className={styles.magicAction}>
              <div className={styles.tooltipContainer} style={{ width: '100%' }}>
                <button className={styles.cleanBtn} onClick={cleanTitles}>
                  <Sparkles size={16} />
                  Nettoyer les titres
                </button>
                <div className={`${styles.tooltip} ${styles.tooltipRight}`} style={{ bottom: 'auto', top: '100%', left: '0', transform: 'none' }}>
                  <strong>Action magique :</strong> Analyse les noms de fichiers pour en extraire le numéro de piste et le titre propre.
                </div>
              </div>
            </div>

            <div className={styles.magicAction}>
              <div className={styles.tooltipContainer} style={{ width: '100%' }}>
                <button 
                  className={`${styles.cleanBtn} ${styles.suggestBtn}`} 
                  onClick={handleSuggestTags}
                  disabled={suggesting}
                >
                  {suggesting ? <RefreshCw className={styles.spin} size={16} /> : <Globe size={16} />}
                  Suggérer via Internet
                </button>
                <div className={`${styles.tooltip} ${styles.tooltipRight}`} style={{ bottom: 'auto', top: '100%', left: '0', transform: 'none' }}>
                  <strong>Recherche intelligente :</strong> Cherche l'album sur Internet et pré-remplit les titres et artistes officiels.
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className={styles.footer}>
          <div className={styles.info}>
            <AlertTriangle size={14} color="var(--warning)" />
            <span>Les modifications sont écrites directement dans les fichiers.</span>
          </div>
          <div className={styles.actions}>
            <button className={styles.cancelBtn} onClick={requestClose} disabled={loading}>
              Annuler
            </button>
            <button className={styles.saveBtn} onClick={handleSave} disabled={loading}>
              {loading ? <RefreshCw className={styles.spin} size={18} /> : <Save size={18} />}
              Sauvegarder les tags
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
