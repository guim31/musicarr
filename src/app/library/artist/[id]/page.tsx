'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, FolderSearch, Link2, MinusCircle, RefreshCw, Shield, Trash2, XCircle } from 'lucide-react';
import DiscographyList, { type DiscographyRelease } from '@/components/artist/DiscographyList';
import SearchModal from '@/components/modals/SearchModal';
import SyncOptionsModal from '@/components/modals/SyncOptionsModal';
import ArtistArt from '@/components/ui/ArtistArt';
import SearchField from '@/components/ui/SearchField';
import Sheet from '@/components/ui/Sheet';
import { useActivity } from '@/context/ActivityContext';
import { useToast } from '@/context/ToastContext';
import { useActivityFinished } from '@/hooks/useApi';
import { api, postJson } from '@/lib/ui/api';
import { formatDateTime, plural } from '@/lib/ui/format';
import { RELEASE_TYPES, type ReleaseType } from '@/services/metadata/releaseTypes';
import styles from './ArtistDetail.module.css';

interface ProviderState {
  provider: string;
  status: 'ok' | 'failed' | 'unmatched' | 'skipped';
  message?: string;
  count: number;
  updatedAt: string;
  scope?: { types?: string[]; deep?: boolean };
}

interface ArtistInfo {
  id: number;
  name: string;
  image?: string | null;
}

interface LocalAlbum {
  id: number;
  name: string;
  type?: string | null;
  status: string;
  release_date?: string | null;
  monitored?: number;
  metadata?: { artworkUrl?: string };
}

interface ReleaseFromApi extends Omit<DiscographyRelease, 'key'> {
  id: number;
  releaseKey: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  musicbrainz: 'MusicBrainz',
  deezer: 'Deezer',
  discogs: 'Discogs',
};

const STATUS_LABELS: Record<ProviderState['status'], string> = {
  ok: 'à jour',
  failed: 'échec',
  unmatched: 'artiste non identifié',
  skipped: 'non configuré',
};

/**
 * Réunit la discographie des fournisseurs et les disques trouvés sur le NAS.
 *
 * Sans cela, la fiche d'un artiste jamais synchronisé — le cas de la plupart —
 * se disait vide alors que ses disques sont bien là : seules les sorties connues
 * d'un fournisseur étaient affichées.
 */
function mergeDiscography(releases: ReleaseFromApi[], albums: LocalAlbum[]): DiscographyRelease[] {
  const linked = new Set(releases.map(release => release.localId).filter(Boolean));
  const merged: DiscographyRelease[] = releases.map(release => ({ ...release, key: `release-${release.id}` }));
  for (const album of albums) {
    if (linked.has(album.id)) continue;
    merged.push({
      key: `album-${album.id}`,
      name: album.name,
      type: (RELEASE_TYPES as readonly string[]).includes(album.type ?? '') ? (album.type as ReleaseType) : 'album',
      releaseDate: album.release_date ?? undefined,
      image: album.metadata?.artworkUrl,
      sources: [],
      localId: album.id,
      isOwned: album.status === 'downloaded',
      monitored: album.monitored !== 0,
    });
  }
  return merged.sort((a, b) => Number(b.isOwned) - Number(a.isOwned) || (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));
}

export default function ArtistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const router = useRouter();
  const { showToast } = useToast();
  const { refresh: refreshActivity } = useActivity();

  const [artist, setArtist] = useState<ArtistInfo | null>(null);
  const [releases, setReleases] = useState<DiscographyRelease[]>([]);
  const [providers, setProviders] = useState<ProviderState[]>([]);
  const [coverAlbumId, setCoverAlbumId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [scanning, setScanning] = useState(false);
  const [fixingPermissions, setFixingPermissions] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchAlbumId, setSearchAlbumId] = useState<number | undefined>();
  const [searchOpen, setSearchOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteWithFiles, setDeleteWithFiles] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [reference, setReference] = useState('');
  const [linking, setLinking] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [artistData, disco, albums] = await Promise.all([
        api<ArtistInfo>(`/api/artists/${id}`).catch(() => null),
        api<{ discography: ReleaseFromApi[]; providers: ProviderState[] }>(`/api/artists/${id}/discography`).catch(() => null),
        api<LocalAlbum[]>(`/api/artists/${id}/albums`).catch(() => [] as LocalAlbum[]),
      ]);
      setArtist(artistData);
      setReleases(mergeDiscography(disco?.discography ?? [], albums));
      setProviders(disco?.providers ?? []);
      setCoverAlbumId(albums.find(album => album.status === 'downloaded')?.id ?? albums[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useActivityFinished(fetchData);

  const counts = useMemo(
    () =>
      releases.reduce<Record<string, number>>((acc, release) => {
        acc[release.type] = (acc[release.type] ?? 0) + 1;
        return acc;
      }, {}),
    [releases],
  );

  const ownedCount = releases.filter(release => release.isOwned).length;
  // Une sortie écartée (homonyme, single sans intérêt) ne manque à personne.
  const wantedCount = releases.filter(release => release.isOwned || release.monitored).length;
  const percent = wantedCount ? Math.round((ownedCount / wantedCount) * 100) : 0;
  const lastUpdate = providers.reduce<string | null>((latest, provider) => (!latest || provider.updatedAt > latest ? provider.updatedAt : latest), null);

  const handleSync = async (types: ReleaseType[], deep: boolean) => {
    try {
      await postJson(`/api/sync/artist/${id}`, { types, deep });
      showToast(`Discographie de ${artist?.name} en cours d’actualisation.`, 'info');
      refreshActivity();
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  const handleScan = async () => {
    setScanning(true);
    setToolsOpen(false);
    try {
      const data = await postJson<{ processed: number }>(`/api/artists/${id}/scan`);
      showToast(`${plural(data.processed, 'fichier traité', 'fichiers traités')}.`, 'success', 'Scan terminé');
      fetchData();
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setScanning(false);
    }
  };

  const handleFixPermissions = async () => {
    setFixingPermissions(true);
    setToolsOpen(false);
    try {
      const data = await postJson<{ message: string }>(`/api/artists/${id}/permissions`);
      showToast(data.message, 'success');
      await postJson(`/api/artists/${id}/scan`);
      fetchData();
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setFixingPermissions(false);
    }
  };

  const handleLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reference.trim()) return;
    setLinking(true);
    try {
      const data = await postJson<{ provider: string }>(`/api/artists/${id}`, { reference: reference.trim() }, 'PATCH');
      showToast(`Fiche ${PROVIDER_LABELS[data.provider] ?? data.provider} rattachée. Actualisez la discographie pour en profiter.`, 'success');
      setReference('');
      fetchData();
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setLinking(false);
    }
  };

  const handleSearchRelease = (release: DiscographyRelease) => {
    setSearchQuery(`${artist?.name ?? ''} ${release.name}`.trim());
    setSearchAlbumId(release.localId);
    setSearchOpen(true);
  };

  const handleToggleMonitor = async (release: DiscographyRelease) => {
    if (release.id === undefined) return;
    const next = !release.monitored;
    // Bascule optimiste : l'écriture est instantanée côté serveur, attendre la
    // réponse ne ferait que rendre le bouton mou.
    const apply = (value: boolean) => setReleases(current => current.map(item => (item.key === release.key ? { ...item, monitored: value } : item)));
    apply(next);
    try {
      await postJson(`/api/releases/${release.id}`, { monitored: next }, 'PATCH');
    } catch (error) {
      apply(!next);
      showToast((error as Error).message, 'error');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api(`/api/artists/${id}?deleteFiles=${deleteWithFiles}`, { method: 'DELETE' });
      showToast(`${artist?.name} a quitté la collection.`, 'success');
      router.push('/library/artists');
    } catch (error) {
      showToast((error as Error).message, 'error');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className={`skeleton ${styles.loading}`} aria-busy="true" />
    );
  }

  if (!artist) {
    return (
      <div className="page empty">
        <p className="hand">Cet artiste a quitté le bac.</p>
        <Link href="/library/artists" className="btn">
          <ArrowLeft size={18} />
          Retour aux artistes
        </Link>
      </div>
    );
  }

  const nameLength = artist.name.length;

  return (
    <div className={styles.artist}>
      <header className={styles.hero}>
        <ArtistArt name={artist.name} image={artist.image} coverAlbumId={coverAlbumId} variant="thumb" eager className={styles.heroArt} />
        <div className={styles.heroInner}>
          <Link href="/library/artists" className={styles.back}>
            <ArrowLeft size={16} />
            Artistes
          </Link>
          <h1 className={`display ${styles.name}`} data-size={nameLength > 50 ? 'xs' : nameLength > 22 ? 's' : nameLength > 11 ? 'm' : 'l'}>
            {artist.name}
          </h1>
          <div className={styles.stats}>
            <span className={`mono ${styles.stat}`}>
              {ownedCount} / {plural(wantedCount, 'sortie')} en collection
            </span>
            {wantedCount > 0 && (
              <span className={styles.meter} aria-hidden="true">
                <i style={{ width: `${percent}%` }} />
              </span>
            )}
          </div>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.actions}>
          <button type="button" className="btn btn-primary" onClick={() => setSyncOpen(true)}>
            <RefreshCw size={18} />
            Actualiser la discographie
          </button>
          <button type="button" className="btn" onClick={handleScan} disabled={scanning}>
            <FolderSearch size={18} className={scanning ? 'pulse' : ''} />
            {scanning ? 'Scan…' : 'Scanner'}
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setToolsOpen(true)}>
            <Link2 size={18} />
            Sources et outils
          </button>
        </div>

        {releases.length > 8 && (
          <div className={styles.filter}>
            <SearchField value={filterQuery} onChange={setFilterQuery} placeholder="Filtrer les sorties…" />
          </div>
        )}

        <DiscographyList releases={releases} counts={counts} filterQuery={filterQuery} onSearch={handleSearchRelease} onToggleMonitor={handleToggleMonitor} />
      </div>

      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} query={searchQuery} albumId={searchAlbumId} />

      <SyncOptionsModal isOpen={syncOpen} onClose={() => setSyncOpen(false)} onSync={handleSync} artistName={artist.name} />

      <Sheet open={toolsOpen} onClose={() => setToolsOpen(false)} title="Sources et outils" subtitle={artist.name}>
        <h3 className={`mono ${styles.toolHeading}`}>Sources {lastUpdate && `· ${formatDateTime(lastUpdate)}`}</h3>
        {providers.length === 0 ? (
          <p className="muted">Pas encore de synchronisation pour cet artiste.</p>
        ) : (
          <ul className={styles.sources}>
            {providers.map(provider => (
              <li key={provider.provider} className={styles.source} data-status={provider.status}>
                {provider.status === 'ok' ? <CheckCircle2 size={16} /> : provider.status === 'failed' ? <XCircle size={16} /> : <MinusCircle size={16} />}
                <span>
                  <strong>{PROVIDER_LABELS[provider.provider] ?? provider.provider}</strong> : {STATUS_LABELS[provider.status]}
                  {provider.status === 'ok' && ` · ${plural(provider.count, 'sortie')}`}
                  {provider.message && <small>{provider.message}</small>}
                </span>
              </li>
            ))}
          </ul>
        )}

        <form className={styles.linkForm} onSubmit={handleLink}>
          <label className="label" htmlFor="artist-reference">
            Rattacher à la bonne fiche
          </label>
          <div className={styles.linkRow}>
            <input
              id="artist-reference"
              className="input"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="URL MusicBrainz, Deezer ou Discogs"
              value={reference}
              onChange={event => setReference(event.target.value)}
            />
            <button type="submit" className="btn btn-icon" disabled={linking || !reference.trim()} aria-label="Rattacher">
              {linking ? <RefreshCw size={18} className="spin" /> : <Link2 size={18} />}
            </button>
          </div>
          <p className="hint">Pour trancher entre deux artistes homonymes, ou quand la recherche automatique échoue.</p>
        </form>

        <h3 className={`mono ${styles.toolHeading}`}>Outils</h3>
        <div className={styles.tools}>
          <button type="button" className="btn btn-quiet btn-block" onClick={handleFixPermissions} disabled={fixingPermissions}>
            <Shield size={18} className={fixingPermissions ? 'pulse' : ''} />
            Corriger les permissions
          </button>
          <button
            type="button"
            className="btn btn-danger btn-block"
            onClick={() => {
              setToolsOpen(false);
              setDeleteOpen(true);
            }}
          >
            <Trash2 size={18} />
            Supprimer l’artiste
          </button>
        </div>
      </Sheet>

      <Sheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        dismissible={!deleting}
        size="small"
        title="Retirer cet artiste ?"
        subtitle={artist.name}
        footer={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Annuler
            </button>
            <button type="button" className="btn btn-danger-solid" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Suppression…' : 'Supprimer'}
            </button>
          </>
        }
      >
        <label className={styles.deleteFiles}>
          <span className="switch">
            <input type="checkbox" checked={deleteWithFiles} onChange={event => setDeleteWithFiles(event.target.checked)} />
            <span />
          </span>
          <span>
            <strong>Supprimer aussi les fichiers du disque</strong>
            <small>{deleteWithFiles ? 'Les fichiers audio seront effacés définitivement.' : 'Les fichiers restent sur le NAS : un prochain scan les retrouvera.'}</small>
          </span>
        </label>
      </Sheet>
    </div>
  );
}
