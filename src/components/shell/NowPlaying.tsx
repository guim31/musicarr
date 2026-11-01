'use client';

import React from 'react';
import Link from 'next/link';
import type { ActiveView } from '@/lib/ui/activity';
import ProgressTape from '@/components/ui/ProgressTape';
import styles from './NowPlaying.module.css';

/**
 * Le « en cours de lecture » de Musicarr : ce qui se télécharge ou se synchronise
 * occupe la place que tiendrait le morceau en cours dans un lecteur, sans jamais
 * recouvrir le contenu comme le faisaient les notifications de progression.
 */
export default function NowPlaying({ items }: { items: ActiveView[] }) {
  const current = items[0];
  const others = items.length - 1;

  return (
    <Link href="/activity" className={styles.bar} aria-label={`${current.title}, ${current.label}. Voir l'activité`}>
      <ProgressTape percent={current.percent} className={styles.tape} />
      <div className={styles.row}>
        <span className="mini-record" aria-hidden="true" />
        <span className={styles.text}>
          <strong className="clamp-1">{current.title}</strong>
          <span className={`mono clamp-1 ${styles.label}`}>{current.label}</span>
        </span>
        {current.percent !== null && <span className={`display ${styles.percent}`}>{Math.round(current.percent)}%</span>}
        {others > 0 && <span className={`mono ${styles.more}`}>+{others}</span>}
      </div>
    </Link>
  );
}
