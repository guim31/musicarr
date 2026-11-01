'use client';

import React, { useEffect, useRef, useState, ViewTransition } from 'react';
import { paperFor } from '@/lib/ui/format';
import styles from './Cover.module.css';

interface CoverProps {
  /** Pochette locale de l'album… */
  albumId?: number | string;
  /** …ou image d'un fournisseur, pour une sortie qu'on ne possède pas. */
  src?: string | null;
  name: string;
  artist?: string | null;
  /** Force le rechargement après un changement de pochette. */
  version?: number;
  /** Largeur d'affichage (attribut `sizes`) : sert une vignette au lieu de l'original. */
  sizes?: string;
  /** Fait glisser la pochette de la liste vers la fiche de l'album. */
  morph?: boolean;
  eager?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function coverUrl(albumId: number | string, version?: number, width?: number): string {
  const params = new URLSearchParams();
  if (width) params.set('w', String(width));
  if (version) params.set('t', String(version));
  const query = params.toString();
  return `/api/albums/${albumId}/cover${query ? `?${query}` : ''}`;
}

/** Vignettes d'une pochette locale, pour `srcset`. */
export function coverSrcSet(albumId: number | string, version?: number): string {
  return [160, 320, 640].map(width => `${coverUrl(albumId, version, width)} ${width}w`).join(', ');
}

/**
 * Pochette d'album. Sans image, on compose une pochette de disque autoproduit —
 * titre tamponné sur papier de couleur — plutôt qu'une icône grise : c'est le cas
 * de centaines de disques, autant que le mur reste beau.
 */
export default function Cover({ albumId, src, name, artist, version, sizes, morph, eager, className, children }: CoverProps) {
  const url = src || (albumId !== undefined ? coverUrl(albumId, version) : null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  const failed = failedUrl === url;

  // Rendue côté serveur, l'image peut échouer avant l'hydratation : `onError` ne
  // se déclencherait alors jamais.
  useEffect(() => {
    const element = image.current;
    if (element && element.complete && element.naturalWidth === 0 && url) setFailedUrl(url);
  }, [url]);

  const content = (
    <div className={`${styles.cover} ${className ?? ''}`}>
      {(!url || failed) && <BlankSleeve name={name} artist={artist} />}
      {url && !failed && (
        // Le dépôt ne passe pas par next/image : l'image vient de notre propre API ou d'un CDN de fournisseur.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={image}
          src={url}
          srcSet={sizes && !src && albumId !== undefined ? coverSrcSet(albumId, version) : undefined}
          sizes={sizes}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailedUrl(url)}
        />
      )}
      {children}
    </div>
  );

  if (morph && albumId !== undefined) {
    return <ViewTransition name={`cover-${albumId}`}>{content}</ViewTransition>;
  }
  return content;
}

export function BlankSleeve({ name, artist }: { name: string; artist?: string | null }) {
  const paper = paperFor(name);
  const length = name.length;
  const size = length <= 8 ? 20 : length <= 16 ? 15 : length <= 32 ? 11.5 : 8.5;
  return (
    <div className={styles.blank} style={{ '--blank-paper': paper, '--blank-size': `${size}cqw` } as React.CSSProperties}>
      <span className={`display ${styles.blankTitle}`}>{name}</span>
      {artist && <span className={`mono ${styles.blankArtist}`}>{artist}</span>}
    </div>
  );
}
