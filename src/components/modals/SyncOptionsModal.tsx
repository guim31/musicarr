'use client';

import React, { useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import Sheet from '@/components/ui/Sheet';
import { DEFAULT_SYNC_TYPES, type ReleaseType } from '@/services/metadata/releaseTypes';
import styles from './Modals.module.css';

interface SyncOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSync: (types: ReleaseType[], deep: boolean) => void;
  artistName: string;
}

/**
 * Les types proposés suivent le vocabulaire canonique. Les albums live, bandes
 * originales, remixes et démos étaient auparavant servis comme des albums studio
 * faute d'être distingués.
 */
const OPTIONS: { id: ReleaseType; label: string; description: string }[] = [
  { id: 'album', label: 'Albums studio', description: 'Les albums officiels' },
  { id: 'ep', label: 'EP', description: 'Sorties courtes' },
  { id: 'single', label: 'Singles', description: 'Titres uniques et maxis' },
  { id: 'compilation', label: 'Compilations', description: 'Best-of et anthologies' },
  { id: 'live', label: 'Live', description: 'Concerts et captations' },
  { id: 'soundtrack', label: 'Bandes originales', description: 'Musiques de film et de jeu' },
  { id: 'remix', label: 'Remixes', description: 'Albums de remixes' },
  { id: 'demo', label: 'Démos', description: 'Maquettes et inédits' },
  { id: 'appearance', label: 'Apparitions', description: 'Participations ailleurs' },
];

export default function SyncOptionsModal({ isOpen, onClose, onSync, artistName }: SyncOptionsModalProps) {
  const [selectedTypes, setSelectedTypes] = useState<ReleaseType[]>(DEFAULT_SYNC_TYPES);
  const [deepSync, setDeepSync] = useState(false);

  const toggleType = (id: ReleaseType) => {
    setSelectedTypes(previous => (previous.includes(id) ? previous.filter(type => type !== id) : [...previous, id]));
  };

  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      title="Actualiser la discographie"
      subtitle={artistName}
      size="large"
      footer={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={selectedTypes.length === 0}
            onClick={() => {
              onSync(selectedTypes, deepSync);
              onClose();
            }}
          >
            <RefreshCw size={18} />
            Lancer
          </button>
        </>
      }
    >
      <p className={styles.lead}>Quels types de sorties récupérer ?</p>
      <div className={styles.options}>
        {OPTIONS.map(option => {
          const checked = selectedTypes.includes(option.id);
          return (
            <label key={option.id} className={styles.option} data-checked={checked}>
              <input type="checkbox" checked={checked} onChange={() => toggleType(option.id)} />
              <span className={styles.box}>{checked && <Check size={15} strokeWidth={3} />}</span>
              <span className={styles.optionText}>
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </span>
            </label>
          );
        })}
      </div>

      <label className={styles.option} data-checked={deepSync} data-wide>
        <input type="checkbox" checked={deepSync} onChange={() => setDeepSync(!deepSync)} />
        <span className={styles.box}>{deepSync && <Check size={15} strokeWidth={3} />}</span>
        <span className={styles.optionText}>
          <strong>Recherche approfondie</strong>
          <span>Parcourt tout le catalogue : plus lent, utile pour les artistes prolifiques.</span>
        </span>
      </label>

      <p className="hint">Les sorties déjà connues restent : synchroniser les albums n’efface pas les singles collectés auparavant.</p>
    </Sheet>
  );
}
