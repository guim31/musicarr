'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { version } from '../../package.json';
import { 
  Music, 
  Library, 
  Search, 
  Download, 
  Settings, 
  AlertCircle,
  Clock,
  LayoutDashboard,
  Terminal
} from 'lucide-react';
import styles from './Sidebar.module.css';

const Sidebar = () => {
  const pathname = usePathname();

  // Un lien reste actif sur ses sous-pages (ex : /library/album/12 → « Ma Collection »)
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  // `short` : libellé compact affiché sous l'icône dans la barre mobile
  const navItems = [
    { name: 'Tableau de bord', short: 'Accueil', href: '/', icon: LayoutDashboard },
    { name: 'Ma Collection', short: 'Collection', href: '/library', icon: Library },
    { name: 'Recherche', short: 'Recherche', href: '/search', icon: Search },
    { name: 'Activité', short: 'Activité', href: '/activity', icon: Clock },
  ];

  const configItems = [
    { name: 'Manquants', short: 'Manquants', href: '/missing', icon: AlertCircle },
    { name: 'Debug Logs', short: 'Debug', href: '/debug', icon: Terminal },
    { name: 'Configuration', short: 'Config', href: '/settings', icon: Settings },
  ];

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <Music size={32} />
        <span>Musicarr</span>
      </div>

      <nav className={styles.nav} aria-label="Navigation principale">
        <div className={styles.navSection}>
          <p className={styles.sectionTitle}>Menu</p>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${isActive(item.href) ? styles.active : ''}`}
              aria-current={isActive(item.href) ? 'page' : undefined}
              title={item.name}
            >
              <item.icon size={20} aria-hidden="true" />
              <span>{item.name}</span>
              <span className={styles.mobileLabel} aria-hidden="true">{item.short}</span>
            </Link>
          ))}
        </div>

        <div className={styles.navSection}>
          <p className={styles.sectionTitle}>Gestion</p>
          {configItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${isActive(item.href) ? styles.active : ''}`}
              aria-current={isActive(item.href) ? 'page' : undefined}
              title={item.name}
            >
              <item.icon size={20} aria-hidden="true" />
              <span>{item.name}</span>
              <span className={styles.mobileLabel} aria-hidden="true">{item.short}</span>
            </Link>
          ))}
        </div>
      </nav>

      <div className={styles.footer}>
        v{version}
      </div>
    </aside>
  );
};

export default Sidebar;
