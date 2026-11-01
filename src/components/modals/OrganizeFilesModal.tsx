'use client';

import React from 'react';
import { AlertTriangle, ArrowDown, FolderSync, RefreshCw } from 'lucide-react';
import Sheet from '@/components/ui/Sheet';
import { useApi } from '@/hooks/useApi';
import styles from './Modals.module.css';

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

const TYPE_LABELS: Record<Change['type'], string> = {
  artist: 'Dossier artiste',
  folder: 'Dossier album',
  file: 'Fichier',
};

export default function OrganizeFilesModal({ isOpen, onClose, albumId, onConfirm, loading, albumName }: OrganizeFilesModalProps) {
  // Le plan n'est calculé qu'à l'ouverture : il dépend de l'état du disque.
  const { data, loading: loadingPlan, error } = useApi<{ plan: Change[] }>(isOpen ? `/api/albums/${albumId}/rename` : null);
  const plan = data?.plan ?? [];

  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      dismissible={!loading}
      title="Ranger les fichiers"
      subtitle={albumName}
      footer={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose} disabled={loading}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={loading || loadingPlan || plan.length === 0}>
            {loading ? <RefreshCw className="spin" size={18} /> : <FolderSync size={18} />}
            {loading ? 'Rangement…' : 'Appliquer'}
          </button>
        </>
      }
    >
      {loadingPlan ? (
        <div className="empty">
          <span className="mini-record" aria-hidden="true" />
          <p>Analyse des fichiers…</p>
        </div>
      ) : error ? (
        <div className="notice notice-bad">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      ) : plan.length === 0 ? (
        <div className="empty">
          <p className="hand">Déjà nickel.</p>
          <p>Tout est rangé comme il faut.</p>
        </div>
      ) : (
        <>
          <ul className={styles.changes}>
            {plan.map((change, index) => (
              <li key={index}>
                <span className={`mono ${styles.changeType}`} data-type={change.type}>
                  {TYPE_LABELS[change.type] ?? change.type}
                </span>
                <span className={styles.changeFrom}>{change.from}</span>
                <ArrowDown size={14} aria-label="devient" />
                <span className={styles.changeTo}>{change.to}</span>
              </li>
            ))}
          </ul>
          <div className="notice notice-warn">
            <AlertTriangle size={18} />
            <span>Ces fichiers seront déplacés ou renommés sur le NAS.</span>
          </div>
        </>
      )}
    </Sheet>
  );
}
