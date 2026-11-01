'use client';

import React, { useState } from 'react';
import { paperFor } from '@/lib/ui/format';
import { coverSrcSet, coverUrl } from './Cover';
import styles from './ArtistArt.module.css';

interface ArtistArtProps {
  name: string;
  image?: string | null;
  coverAlbumId?: number | null;
  /** `tile` affiche le nom en grand quand il n'y a aucune image. */
  variant?: 'thumb' | 'tile';
  className?: string;
  eager?: boolean;
  /** Largeur d'affichage : sert une vignette de pochette au lieu de l'original. */
  sizes?: string;
}

/**
 * Visuel d'artiste : sa photo, ou à défaut son dernier disque, photocopié sur un
 * papier de couleur propre à l'artiste. Seuls 5 % des artistes de la base ont une
 * photo : c'est donc le cas général, et ce traitement unifie le mur d'affiches.
 */
export default function ArtistArt({ name, image, coverAlbumId, variant = 'thumb', className, eager, sizes }: ArtistArtProps) {
  const candidates = [image, coverAlbumId ? coverUrl(coverAlbumId) : null].filter(Boolean) as string[];
  const [failures, setFailures] = useState(0);
  const url = candidates[failures];

  return (
    <div className={`${styles.art} ${className ?? ''}`} style={{ '--paper-tone': paperFor(name) } as React.CSSProperties}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          srcSet={sizes && coverAlbumId && url !== image ? coverSrcSet(coverAlbumId) : undefined}
          sizes={sizes}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailures(count => count + 1)}
        />
      ) : variant === 'tile' ? (
        <span className={`display ${styles.name}`}>{name}</span>
      ) : (
        <span className={`display ${styles.initial}`}>{name.replace(/^the\s+/i, '').charAt(0)}</span>
      )}
    </div>
  );
}
