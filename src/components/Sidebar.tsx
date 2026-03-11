'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Music, 
  Library, 
  Search, 
  Download, 
  Settings, 
  AlertCircle,
  Clock,
  LayoutDashboard
} from 'lucide-react';
import styles from './Sidebar.module.css';

const Sidebar = () => {
  const pathname = usePathname();

  const navItems = [
    { name: 'Tableau de bord', href: '/', icon: LayoutDashboard },
    { name: 'Ma Collection', href: '/library', icon: Library },
    { name: 'Recherche', href: '/search', icon: Search },
    { name: 'Activité', href: '/activity', icon: Clock },
  ];

  const configItems = [
    { name: 'Manquants', href: '/missing', icon: AlertCircle },
    { name: 'Configuration', href: '/settings', icon: Settings },
  ];

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <Music size={32} />
        <span>Musicarr</span>
      </div>

      <nav className={styles.nav}>
        <div className={styles.navSection}>
          <p className={styles.sectionTitle}>Menu</p>
          {navItems.map((item) => (
            <Link 
              key={item.href} 
              href={item.href}
              className={`${styles.navLink} ${pathname === item.href ? styles.active : ''}`}
            >
              <item.icon size={20} />
              {item.name}
            </Link>
          ))}
        </div>

        <div className={styles.navSection}>
          <p className={styles.sectionTitle}>Gestion</p>
          {configItems.map((item) => (
            <Link 
              key={item.href} 
              href={item.href}
              className={`${styles.navLink} ${pathname === item.href ? styles.active : ''}`}
            >
              <item.icon size={20} />
              {item.name}
            </Link>
          ))}
        </div>
      </nav>

      <div className={styles.footer}>
        v0.1.0-alpha
      </div>
    </aside>
  );
};

export default Sidebar;
