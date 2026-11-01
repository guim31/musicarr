'use client';

import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';
import styles from './Sheet.module.css';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'small' | 'medium' | 'large' | 'full';
  /** Faux pendant une écriture sur le disque : ni Échap, ni clic à côté. */
  dismissible?: boolean;
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface OpenSheet {
  href: string;
  onBack: () => void;
}

/** Feuilles ouvertes, de la plus ancienne à la plus récente : seule la dernière répond au Retour. */
const openSheets: OpenSheet[] = [];
/** Retours d'historique lancés par nous : ce n'est pas l'utilisateur qui appuie sur Retour. */
let ownTraversals = 0;
let entriesToDrop = 0;
let dropTimer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

function handlePopState() {
  if (ownTraversals > 0) {
    ownTraversals -= 1;
    return;
  }
  const top = openSheets[openSheets.length - 1];
  if (!top || window.location.href !== top.href) return;
  window.history.pushState(window.history.state, '', top.href);
  top.onBack();
}

/** Plusieurs feuilles peuvent se fermer d'un coup : un seul déplacement, qui retire toutes leurs entrées. */
function dropHistoryEntry() {
  entriesToDrop += 1;
  if (dropTimer !== null) return;
  dropTimer = setTimeout(() => {
    const count = entriesToDrop;
    entriesToDrop = 0;
    dropTimer = null;
    ownTraversals += 1;
    window.history.go(-count);
  }, 0);
}

/**
 * Au téléphone, le bouton Retour doit refermer la feuille, pas quitter la page.
 *
 * L'ouverture ajoute une entrée d'historique sur la même URL. Le Retour la
 * consomme : on la remet aussitôt, puis on demande la fermeture, qui peut être
 * refusée (écriture en cours, modifications à confirmer). Quand la feuille se
 * ferme vraiment, elle retire son entrée — sauf si l'on a changé de page entre-temps.
 */
function useBackToClose(open: boolean, onClose: () => void, dismissible: boolean) {
  const latest = useRef({ onClose, dismissible });
  useEffect(() => {
    latest.current = { onClose, dismissible };
  });

  useEffect(() => {
    if (!open) return;
    if (!listening) {
      window.addEventListener('popstate', handlePopState);
      listening = true;
    }
    const entry: OpenSheet = {
      href: window.location.href,
      onBack: () => {
        if (latest.current.dismissible) latest.current.onClose();
      },
    };
    openSheets.push(entry);
    window.history.pushState(window.history.state, '', entry.href);

    return () => {
      openSheets.splice(openSheets.indexOf(entry), 1);
      if (window.location.href === entry.href) dropHistoryEntry();
    };
  }, [open]);
}

/**
 * Modale de l'application : feuille qui monte du bas au téléphone, fenêtre au
 * centre sur grand écran. Elle repose sur `<dialog>`, qui apporte gratuitement
 * le piège du focus, la touche Échap et le passage au-dessus de la navigation.
 */
export default function Sheet({ open, onClose, title, subtitle, children, footer, size = 'medium', dismissible = true }: SheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useBackToClose(open, onClose, dismissible);

  useIsomorphicLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialog}
      className={styles.sheet}
      data-size={size}
      onCancel={event => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={event => {
        if (event.target === event.currentTarget && dismissible) onClose();
      }}
    >
      <div className={styles.frame}>
        <header className={styles.header}>
          <div className={styles.titles}>
            <h2 className="display">{title}</h2>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          <button type="button" className="btn btn-quiet btn-icon btn-sm" onClick={onClose} disabled={!dismissible} aria-label="Fermer">
            <X size={18} />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </dialog>
  );
}
