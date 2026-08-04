'use client';

import React, { useEffect, useState } from 'react';
import { 
  FolderSync, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw,
  ArrowRight,
  ChevronRight,
  Info
} from 'lucide-react';
import styles from './OrganizeFilesModal.module.css';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';

interface Change {
  type: 'file' | 'folder' | 'artist';
  from: string;
  to: string;
}

interface OrganizeFilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  albumId: number;
  onConfirm: () => void;
  loading: boolean;
  albumName: string;
}

export default function OrganizeFilesModal({ isOpen, onClose, albumId, onConfirm, loading, albumName }: OrganizeFilesModalProps) {
  const [plan, setPlan] = useState<Change[]>([]);
  const [loadingPlan, setLoadingPlan] = useState(false);
  // Pas de fermeture pendant le déplacement des fichiers
  useEscapeToClose(isOpen && !loading, onClose);

  // Déclaré avant l'effet qui l'appelle, pour éviter l'accès en zone morte.
  const fetchPlan = async () => {
    setLoadingPlan(true);
    try {
      const res = await fetch(`/api/albums/${albumId}/rename`);
      const data = await res.json();
      if (data.success) {
        setPlan(data.plan);
      }
    } catch (err) {
      console.error("Failed to fetch plan:", err);
    } finally {
      setLoadingPlan(false);
    }
  };

  useEffect(() => {
    if (isOpen && albumId) {
      fetchPlan();
    }
  }, [isOpen, albumId]);

  if (!isOpen) return null;

  const getTypeLabel = (type: string) => {
    switch(type) {
      case 'artist': return 'Dossier Artiste';
      case 'folder': return 'Dossier Album';
      case 'file': return 'Fichier';
      default: return type;
    }
  };

  const getTypeStyle = (type: string) => {
    switch(type) {
      case 'artist': return styles.typeArtist;
      case 'folder': return styles.typeFolder;
      case 'file': return styles.typeFile;
      default: return '';
    }
  };

  return (
    <div className={styles.overlay} onClick={loading ? undefined : onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Réorganiser la bibliothèque">
        <header className={styles.header}>
          <div className={styles.iconWrapper}>
            <FolderSync size={24} />
          </div>
          <h3>Réorganiser la bibliothèque</h3>
        </header>

        <div className={styles.body}>
          <p className={styles.description}>
            Musicarr a analysé l'album <strong>{albumName}</strong>. Voici les changements prévus :
          </p>

          <div className={styles.planSection}>
            <span className={styles.planTitle}>Modifications détectées</span>
            
            {loadingPlan ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '20px', color: 'var(--text-muted)' }}>
                <RefreshCw className={styles.spin} size={20} />
                <span>Analyse des fichiers en cours...</span>
              </div>
            ) : plan.length === 0 ? (
              <div className={styles.emptyPlan}>
                <CheckCircle2 size={24} style={{ marginBottom: '8px' }} />
                <p>Tout est déjà parfaitement organisé !</p>
              </div>
            ) : (
              <div className={styles.changeList}>
                {plan.map((change, idx) => (
                  <div key={idx} className={styles.changeItem}>
                    <div className={`${styles.changeType} ${getTypeStyle(change.type)}`}>
                      {getTypeLabel(change.type)}
                    </div>
                    <div className={styles.changeDiff}>
                      <span className={styles.oldValue}>{change.from}</span>
                      <ChevronRight className={styles.arrow} size={14} />
                      <span className={styles.newValue}>{change.to}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.warning}>
            <AlertTriangle size={20} />
            <span>Attention : Cette action va déplacer ou renommer des fichiers sur votre NAS.</span>
          </div>
        </div>

        <footer className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={loading}>
            Annuler
          </button>
          <button 
            className={styles.confirmBtn} 
            onClick={onConfirm} 
            disabled={loading || (plan.length === 0 && !loadingPlan)}
          >
            {loading ? <RefreshCw className={styles.spin} size={18} /> : <FolderSync size={18} />}
            {loading ? 'Traitement...' : 'Appliquer les changements'}
          </button>
        </footer>
      </div>
    </div>
  );
}
