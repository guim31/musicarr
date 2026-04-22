'use client';

import React, { useState } from 'react';
import { RefreshCw, X, Check, Filter } from 'lucide-react';
import styles from './SyncOptionsModal.module.css';

interface SyncOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSync: (types: string[]) => void;
  artistName: string;
}

export default function SyncOptionsModal({ isOpen, onClose, onSync, artistName }: SyncOptionsModalProps) {
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['album', 'ep']);
  
  const options = [
    { id: 'album', label: 'Albums Studio', description: 'Les albums officiels de l\'artiste' },
    { id: 'ep', label: 'EPs', description: 'Extended Plays et sorties courtes' },
    { id: 'single', label: 'Singles', description: 'Titres uniques et maxis' },
    { id: 'compilation', label: 'Compilations', description: 'Best-of et anthologies' },
    { id: 'appearance', label: 'Apparitions', description: 'Participations sur d\'autres albums' },
  ];

  if (!isOpen) return null;

  const toggleType = (id: string) => {
    setSelectedTypes(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const handleSync = () => {
    onSync(selectedTypes);
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.content} onClick={e => e.stopPropagation()}>
        <header className={styles.header}>
          <div className={styles.titleArea}>
            <RefreshCw size={24} color="var(--accent)" />
            <div>
              <h3>Options de Synchronisation</h3>
              <p>{artistName}</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className={styles.body}>
          <p className={styles.instruction}>Sélectionnez les types de sorties à rechercher :</p>
          
          <div className={styles.optionsGrid}>
            {options.map(opt => (
              <label key={opt.id} className={`${styles.optionItem} ${selectedTypes.includes(opt.id) ? styles.active : ''}`}>
                <input 
                  type="checkbox" 
                  checked={selectedTypes.includes(opt.id)}
                  onChange={() => toggleType(opt.id)}
                  className={styles.hiddenInput}
                />
                <div className={styles.checkbox}>
                  {selectedTypes.includes(opt.id) && <Check size={14} />}
                </div>
                <div className={styles.optionText}>
                  <strong>{opt.label}</strong>
                  <span>{opt.description}</span>
                </div>
              </label>
            ))}
          </div>

          <div className={styles.infoBox}>
            <Filter size={18} />
            <p>Limiter les types (ex: décocher "Apparitions") accélère considérablement le scan pour les gros catalogues.</p>
          </div>
        </div>

        <footer className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Annuler</button>
          <button 
            className={styles.syncBtn} 
            onClick={handleSync}
            disabled={selectedTypes.length === 0}
          >
            Lancer la synchronisation
          </button>
        </footer>
      </div>
    </div>
  );
}
