'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertCircle, Clock, Home, Library, Search, Settings, Terminal } from 'lucide-react';
import { version } from '../../../package.json';
import { useActivity } from '@/context/ActivityContext';
import NowPlaying from './NowPlaying';
import styles from './AppShell.module.css';

interface NavItem {
  href: string;
  label: string;
  track: string;
  icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
}

/** Une navigation qui se lit comme le dos d'une pochette : Face A pour écouter, Face B pour bricoler. */
const SIDE_A: NavItem[] = [
  { href: '/', label: 'Accueil', track: 'A1', icon: Home },
  { href: '/library', label: 'Collection', track: 'A2', icon: Library },
  { href: '/search', label: 'Recherche', track: 'A3', icon: Search },
  { href: '/activity', label: 'Activité', track: 'A4', icon: Clock },
];

const SIDE_B: NavItem[] = [
  { href: '/missing', label: 'Manquants', track: 'B1', icon: AlertCircle },
  { href: '/settings', label: 'Réglages', track: 'B2', icon: Settings },
  { href: '/debug', label: 'Journal', track: 'B3', icon: Terminal },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function Wordmark() {
  return (
    <Link href="/" className={styles.wordmark} aria-label="Musicarr, accueil">
      <span className="display misprint">Musicarr</span>
      <span aria-hidden="true" className={styles.star}>
        ★
      </span>
    </Link>
  );
}

function Sidebar({ pathname, activeCount, missingCount }: { pathname: string; activeCount: number; missingCount: number | null }) {
  const renderItem = (item: NavItem) => {
    const current = isActive(pathname, item.href);
    const badge =
      item.href === '/activity' && activeCount > 0
        ? activeCount
        : item.href === '/missing' && missingCount
          ? missingCount.toLocaleString('fr-FR')
          : null;
    return (
      <li key={item.href}>
        <Link href={item.href} className={styles.sideLink} aria-current={current ? 'page' : undefined}>
          <span className={`mono ${styles.track}`}>{item.track}</span>
          <span className={styles.sideLabel}>{item.label}</span>
          {badge !== null && <span className={`mono ${styles.sideBadge}`} data-live={item.href === '/activity'}>{badge}</span>}
        </Link>
      </li>
    );
  };

  return (
    <aside className={styles.sidebar}>
      <Wordmark />
      <nav aria-label="Navigation principale" className={styles.sideNav}>
        <p className={`mono ${styles.side}`}>Face A</p>
        <ul>{SIDE_A.map(renderItem)}</ul>
        <p className={`mono ${styles.side}`}>Face B</p>
        <ul>{SIDE_B.map(renderItem)}</ul>
      </nav>
      <p className={`mono ${styles.colophon}`}>
        Fait maison · v{version}
      </p>
    </aside>
  );
}

function Dock({ pathname, activeCount }: { pathname: string; activeCount: number }) {
  const items = [
    { href: '/', label: 'Accueil', icon: Home },
    { href: '/library', label: 'Collection', icon: Library },
    { href: '/search', label: 'Chercher', icon: Search, primary: true },
    { href: '/missing', label: 'Manquants', icon: AlertCircle },
    { href: '/activity', label: 'Activité', icon: Clock, badge: activeCount },
  ];

  return (
    <nav className={styles.dock} aria-label="Navigation principale">
      {items.map(item => {
        const current = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={item.primary ? styles.dockPrimary : styles.dockLink}
            aria-current={current ? 'page' : undefined}
          >
            <span className={styles.dockIcon}>
              <item.icon size={item.primary ? 24 : 22} aria-hidden={true} />
              {!!item.badge && <span className={`mono ${styles.dockBadge}`}>{item.badge}</span>}
            </span>
            <span className={styles.dockLabel}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function TopBar({ pathname }: { pathname: string }) {
  return (
    <header className={styles.topbar}>
      <Wordmark />
      <Link
        href="/settings"
        className={styles.topAction}
        aria-label="Réglages"
        aria-current={isActive(pathname, '/settings') ? 'page' : undefined}
      >
        <Settings size={22} />
      </Link>
    </header>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { active, missingCount } = useActivity();
  // L'accueil et la page Activité détaillent déjà ce qui tourne.
  const playing = active.length > 0 && pathname !== '/' && !isActive(pathname, '/activity');

  return (
    <div className={styles.shell} data-playing={playing}>
      <a href="#contenu" className={styles.skip}>
        Aller au contenu
      </a>
      <Sidebar pathname={pathname} activeCount={active.length} missingCount={missingCount} />
      <TopBar pathname={pathname} />
      <main id="contenu" className={styles.main}>
        {children}
      </main>
      {playing && <NowPlaying items={active} />}
      <Dock pathname={pathname} activeCount={active.length} />
    </div>
  );
}
