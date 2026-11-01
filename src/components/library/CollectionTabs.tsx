'use client';

import React from 'react';
import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import styles from './CollectionTabs.module.css';

export default function CollectionHeader({ section }: { section: 'albums' | 'artists' }) {
  return (
    <>
      <PageHeader
        mark="Face A · Piste 2"
        title="Collection"
        actions={
          <Link href="/library/add" className="btn btn-primary btn-collapse" aria-label="Ajouter un artiste">
            <UserPlus size={18} />
            <span>Ajouter un artiste</span>
          </Link>
        }
      />
      <nav className={styles.tabs} aria-label="Sections de la collection">
        <Link href="/library" className={styles.tab} aria-current={section === 'albums' ? 'page' : undefined}>
          Disques
        </Link>
        <Link href="/library/artists" className={styles.tab} aria-current={section === 'artists' ? 'page' : undefined}>
          Artistes
        </Link>
      </nav>
    </>
  );
}
