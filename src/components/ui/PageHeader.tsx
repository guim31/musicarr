import React from 'react';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  /** Repère façon pochette : « Face A · 2 ». */
  mark: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  tapeClass?: string;
}

export default function PageHeader({ mark, title, subtitle, actions, tapeClass = '' }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.titles}>
        <span className={`tape ${tapeClass}`}>{mark}</span>
        <h1 className={`display misprint ${styles.title}`}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
