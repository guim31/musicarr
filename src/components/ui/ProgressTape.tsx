import React from 'react';

/** Barre de progression en ruban de chantier ; `percent` nul = avancement inconnu. */
export default function ProgressTape({ percent, className, label }: { percent: number | null; className?: string; label?: string }) {
  return (
    <span
      className={`tapebar ${className ?? ''}`}
      data-indeterminate={percent === null}
      style={{ '--p': `${percent ?? 100}%` } as React.CSSProperties}
      role="progressbar"
      aria-label={label ?? 'Progression'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent === null ? undefined : Math.round(percent)}
    >
      <i />
    </span>
  );
}
