'use client';

import React, { useState } from 'react';
import { RefreshCw, X, Check, Filter } from 'lucide-react';
import styles from './SyncOptionsModal.module.css';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';
import { DEFAULT_SYNC_TYPES, type ReleaseType } from '@/services/metadata/releaseTypes';

interface SyncOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSync: (types: ReleaseType[], deep: boolean) => void;
  artistName: string;
}

/**
 * Les types proposés suivent désormais le vocabulaire canonique. Les albums
 * live, bandes originales, remixes et démos étaient auparavant servis comme
 * des albums studio faute d'être distingués.
 */
const OPTIONS: { id: ReleaseType; label: string; description: string }[] = [
  { id: 'album', label: 'Albums studio', description: 'Les albums officiels de l’artiste' },
  { id: 'ep', label: 'EP', description: 'Extended plays et sorties courtes' },
  { id: 'single', label: 'Singles', description: 'Titres uniques et maxis' },
  { id: 'compilation', label: 'Compilations', description: 'Best-of et anthologies' },
  { id: 'live', label: 'Live', description: 'Concerts et captations' },
  { id: 'soundtrack', label: 'Bandes originales', description: 'Musiques de film et de jeu' },
  { id: 'remix', label: 'Remixes', description: 'Albums de remixes' },
  { id: 'demo', label: 'Démos', description: 'Maquettes et sessions inédites' },
  { id: 'appearance', label: 'Apparitions', description: 'Participations sur d’autres disques' },
];

export default function SyncOptionsModal({ isOpen, onClose, onSync, artistName }: SyncOptionsModalProps) {
  const [selectedTypes, setSelectedTypes] = useState<ReleaseType[]>(DEFAULT_SYNC_TYPES);
  const [deepSync, setDeepSync] = useState(false);
  useEscapeToClose(isOpen, onClose);

  if (!isOpen) return null;

  const toggleType = (id: ReleaseType) => {
    setSelectedTypes(previous =>
      previous.includes(id) ? previous.filter(type => type !== id) : [...previous, id],
    );
  };

  const handleSync = () => {
    onSync(selectedTypes, deepSync);
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.content}
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Options de synchronisation"
      >
        <header className={styles.header}>
          <div className={styles.titleArea}>
            <RefreshCw size={24} color="var(--accent)" />
            <div>
              <h3>Options de synchronisation</h3>
              <p>{artistName}</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>

        <div className={styles.body}>
          <p className={styles.instruction}>Sélectionnez les types de sorties à récupérer :</p>

          <div className={styles.optionsGrid}>
            {OPTIONS.map(option => (
              <label
                key={option.id}
                className={`${styles.optionItem} ${selectedTypes.includes(option.id) ? styles.active : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedTypes.includes(option.id)}
                  onChange={() => toggleType(option.id)}
                  className={styles.hiddenInput}
                />
                <div className={styles.checkbox}>
                  {selectedTypes.includes(option.id) && <Check size={14} />}
                </div>
                <div className={styles.optionText}>
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </div>
              </label>
            ))}
          </div>

          <div className={styles.deepSyncSection}>
            <label className={`${styles.optionItem} ${deepSync ? styles.active : ''}`}>
              <input
                type="checkbox"
                checked={deepSync}
                onChange={() => setDeepSync(!deepSync)}
                className={styles.hiddenInput}
              />
              <div className={styles.checkbox}>{deepSync && <Check size={14} />}</div>
              <div className={styles.optionText}>
                <strong>Recherche approfondie</strong>
                <span>Parcourt l’intégralité du catalogue : plus lent, utile pour les artistes prolifiques</span>
              </div>
            </label>
          </div>

          <div className={styles.infoBox}>
            <Filter size={18} />
            <p>
              Les types non cochés ne sont pas récupérés, mais les sorties déjà connues sont
              conservées : synchroniser les albums n’efface pas les singles collectés auparavant.
            </p>
          </div>
        </div>

        <footer className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>
            Annuler
          </button>
          <button className={styles.syncBtn} onClick={handleSync} disabled={selectedTypes.length === 0}>
            Lancer la synchronisation
          </button>
        </footer>
      </div>
    </div>
  );
}
