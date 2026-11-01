'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Eye, EyeOff, RefreshCw, Save, Search, Terminal, XCircle } from 'lucide-react';
import { version } from '../../../package.json';
import PageHeader from '@/components/ui/PageHeader';
import ProgressTape from '@/components/ui/ProgressTape';
import { useActivity } from '@/context/ActivityContext';
import { useToast } from '@/context/ToastContext';
import { api, postJson } from '@/lib/ui/api';
import { describeScan } from '@/lib/ui/activity';
import { plural } from '@/lib/ui/format';
import styles from './Settings.module.css';

interface Indexer {
  id: number;
  name: string;
  protocol: string;
  enabled: number | boolean;
}

const SECTIONS = [
  { id: 'bibliotheque', label: 'Bibliothèque' },
  { id: 'prowlarr', label: 'Prowlarr' },
  { id: 'sabnzbd', label: 'SABnzbd' },
  { id: 'deezer', label: 'Deezer' },
  { id: 'discogs', label: 'Discogs' },
];

function SecretField({ id, label, value, onChange, placeholder, hint }: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder: string; hint?: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <div className={styles.field}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className={styles.secret}>
        <input
          id={id}
          className="input"
          type={shown ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          onChange={event => onChange(event.target.value)}
        />
        <button type="button" onClick={() => setShown(current => !current)} aria-label={shown ? 'Masquer' : 'Afficher'}>
          {shown ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

function TextField({ id, label, value, onChange, placeholder, inputMode, hint }: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder?: string; inputMode?: 'url' | 'text'; hint?: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        type="text"
        inputMode={inputMode}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
      />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const { showToast } = useToast();
  const { scan, refresh } = useActivity();

  const [prowlarrUrl, setProwlarrUrl] = useState('');
  const [prowlarrApiKey, setProwlarrApiKey] = useState('');
  const [indexers, setIndexers] = useState<Indexer[]>([]);

  const [sabUrl, setSabUrl] = useState('');
  const [sabApiKey, setSabApiKey] = useState('');
  const [sabCategory, setSabCategory] = useState('music');

  const [libraryPath, setLibraryPath] = useState('');
  const [libraryStats, setLibraryStats] = useState({ artists: 0, albums: 0 });
  const [readOnly, setReadOnly] = useState(true);
  const [isWritable, setIsWritable] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [preview, setPreview] = useState<{ folders: string[]; total: number } | null>(null);
  const [previewError, setPreviewError] = useState('');

  const [discogsToken, setDiscogsToken] = useState('');
  const [deezerArl, setDeezerArl] = useState('');
  const [deezerQuality, setDeezerQuality] = useState('MP3_320');

  // Action en cours, par bouton : le bon spinner au bon endroit, et aucun double envoi.
  const [busy, setBusy] = useState<string | null>(null);

  const fetchConfig = async () => {
    const results = await Promise.allSettled([
      api<{ config?: { url?: string; apiKey?: string }; indexers?: Indexer[] }>('/api/prowlarr'),
      api<{ url?: string; apiKey?: string; category?: string }>('/api/sabnzbd'),
      api<{ path?: string; stats?: { artists: number; albums: number }; readOnly?: boolean; isWritable?: boolean }>('/api/library'),
      api<{ discogsToken?: string; deezerArl?: string; deezerQuality?: string }>('/api/metadata'),
    ]);
    const [prowlarr, sab, library, metadata] = results;
    if (prowlarr.status === 'fulfilled') {
      setProwlarrUrl(prowlarr.value.config?.url || '');
      setProwlarrApiKey(prowlarr.value.config?.apiKey || '');
      setIndexers(prowlarr.value.indexers ?? []);
    }
    if (sab.status === 'fulfilled') {
      setSabUrl(sab.value.url || '');
      setSabApiKey(sab.value.apiKey || '');
      setSabCategory(sab.value.category || '');
    }
    if (library.status === 'fulfilled') {
      setLibraryPath(library.value.path || '');
      setLibraryStats(library.value.stats ?? { artists: 0, albums: 0 });
      setReadOnly(library.value.readOnly ?? true);
      setIsWritable(library.value.isWritable ?? false);
      setConfigLoaded(true);
    }
    if (metadata.status === 'fulfilled') {
      setDiscogsToken(metadata.value.discogsToken || '');
      setDeezerArl(metadata.value.deezerArl || '');
      setDeezerQuality(metadata.value.deezerQuality || 'MP3_320');
    }
    if (results.some(result => result.status === 'rejected')) {
      showToast('Une partie de la configuration n’a pas pu être lue.', 'warning');
    }
  };

  useEffect(() => {
    fetchConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lecture unique à l'ouverture
  }, []);

  /** Lance une action d'un bouton : verrouille, signale l'erreur, libère. */
  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    try {
      await action();
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const testProwlarr = () =>
    run('prowlarr-test', async () => {
      const data = await postJson<{ success: boolean }>('/api/prowlarr', { url: prowlarrUrl, apiKey: prowlarrApiKey, action: 'test' });
      if (data.success) showToast('Connexion à Prowlarr réussie.', 'success');
      else showToast('Prowlarr ne répond pas : vérifiez l’URL et la clé.', 'error');
    });

  const saveProwlarr = () =>
    run('prowlarr-save', async () => {
      const data = await postJson<{ success: boolean; indexersSynced?: number; error?: string }>('/api/prowlarr', { url: prowlarrUrl, apiKey: prowlarrApiKey, action: 'save' });
      if (!data.success) throw new Error(data.error || 'Enregistrement impossible.');
      showToast(`Prowlarr enregistré. ${plural(data.indexersSynced ?? 0, 'indexeur synchronisé', 'indexeurs synchronisés')}.`, 'success');
      await fetchConfig();
    });

  const syncIndexers = () =>
    run('prowlarr-sync', async () => {
      const data = await postJson<{ success: boolean; count?: number; error?: string }>('/api/prowlarr', { action: 'sync' });
      if (!data.success) throw new Error(data.error || 'Synchronisation impossible.');
      showToast(`${plural(data.count ?? 0, 'indexeur synchronisé', 'indexeurs synchronisés')}.`, 'success');
      await fetchConfig();
    });

  const testSab = () =>
    run('sab-test', async () => {
      const data = await postJson<{ success: boolean }>('/api/sabnzbd', { url: sabUrl, apiKey: sabApiKey, action: 'test' });
      if (data.success) showToast('Connexion à SABnzbd réussie.', 'success');
      else showToast('SABnzbd ne répond pas : vérifiez l’URL et la clé.', 'error');
    });

  const saveSab = () =>
    run('sab-save', async () => {
      const data = await postJson<{ success: boolean; error?: string }>('/api/sabnzbd', { url: sabUrl, apiKey: sabApiKey, category: sabCategory, action: 'save' });
      if (!data.success) throw new Error(data.error || 'Enregistrement impossible.');
      showToast('SABnzbd enregistré.', 'success');
    });

  const saveLibrary = () =>
    run('library-save', async () => {
      await postJson('/api/library', { action: 'save_path', path: libraryPath });
      showToast('Dossier de la bibliothèque enregistré.', 'success');
      await fetchConfig();
    });

  const previewPath = () =>
    run('library-preview', async () => {
      setPreview(null);
      setPreviewError('');
      const data = await postJson<{ success?: boolean; folders?: string[]; total?: number; error?: string }>('/api/library', { action: 'preview_path', path: libraryPath });
      if (data.success) setPreview({ folders: data.folders ?? [], total: data.total ?? 0 });
      else setPreviewError(data.error || 'Prévisualisation impossible.');
    });

  const startScan = () =>
    run('library-scan', async () => {
      await postJson('/api/library', { action: 'scan' });
      showToast('Le scan démarre.', 'info');
      refresh();
    });

  const toggleReadOnly = async (value: boolean) => {
    setReadOnly(value);
    try {
      await postJson('/api/library', { action: 'save_read_only', value });
      showToast(value ? 'Lecture seule activée.' : 'Écriture activée.', 'info');
    } catch (error) {
      setReadOnly(!value);
      showToast((error as Error).message, 'error');
    }
  };

  const saveMetadata = (key: string) =>
    run(key, async () => {
      await postJson('/api/metadata', { discogsToken, deezerArl, deezerQuality });
      showToast('Enregistré.', 'success');
    });

  const spinner = (key: string, icon: React.ReactNode) => (busy === key ? <RefreshCw size={17} className="spin" /> : icon);
  const scanView = scan ? describeScan(scan) : null;

  return (
    <div className="page">
      <PageHeader mark="Face B · Piste 2" title="Réglages" />

      <nav className={`chips ${styles.anchors}`} aria-label="Sections des réglages">
        {SECTIONS.map(section => (
          <a key={section.id} href={`#${section.id}`} className="chip">
            {section.label}
          </a>
        ))}
        <Link href="/debug" className="chip">
          <Terminal size={14} />
          Journal
        </Link>
      </nav>

      <div className={styles.sections}>
        <section id="bibliotheque" className={`${styles.section} ${styles.sectionTall}`}>
          <h2 className="display">Bibliothèque</h2>
          {libraryStats.artists > 0 && (
            <p className={`mono ${styles.lead}`}>
              {plural(libraryStats.albums, 'disque')} · {plural(libraryStats.artists, 'artiste')}
            </p>
          )}

          <TextField
            id="library-path"
            label="Dossier de la musique"
            value={libraryPath}
            onChange={setLibraryPath}
            placeholder="/app/music"
            hint={
              <>
                Le chemin vu depuis le conteneur : <code>/app/music</code> en général.
              </>
            }
          />

          {previewError && (
            <div className="notice notice-bad">
              <XCircle size={18} />
              <span>{previewError}</span>
            </div>
          )}
          {preview && (
            <div className="notice notice-ok">
              <CheckCircle2 size={18} />
              <div>
                {preview.total === 0 ? (
                  'Dossier accessible, mais sans sous-dossier d’artiste.'
                ) : (
                  <>
                    <strong>{plural(preview.total, 'dossier trouvé', 'dossiers trouvés')}</strong>
                    <ul className={styles.previewList}>
                      {preview.folders.map(folder => (
                        <li key={folder}>{folder}</li>
                      ))}
                      {preview.total > preview.folders.length && <li>… et {preview.total - preview.folders.length} autres</li>}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}

          <div className={styles.actions}>
            <button type="button" className="btn btn-quiet" onClick={previewPath} disabled={busy !== null || !libraryPath}>
              {spinner('library-preview', <Search size={17} />)}
              Aperçu
            </button>
            <button type="button" className="btn btn-quiet" onClick={saveLibrary} disabled={busy !== null}>
              {spinner('library-save', <Save size={17} />)}
              Enregistrer
            </button>
            <button type="button" className="btn btn-primary" onClick={startScan} disabled={busy !== null || Boolean(scan) || !libraryPath}>
              {spinner('library-scan', <RefreshCw size={17} className={scan ? 'spin' : ''} />)}
              {scan ? 'Scan en cours' : 'Lancer le scan'}
            </button>
          </div>

          {scanView && (
            <div className={styles.scan}>
              <div className={`mono ${styles.scanLabel}`}>
                <span>{scanView.label}</span>
                {scanView.percent !== null && <span>{Math.round(scanView.percent)} %</span>}
              </div>
              <ProgressTape percent={scanView.percent} label="Scan de la bibliothèque" />
            </div>
          )}

          <hr className={styles.rule} />

          <label className={styles.toggle}>
            <span>
              <strong>Lecture seule</strong>
              <small>Empêche l’application de créer des dossiers ou de modifier les tags.</small>
            </span>
            <span className="switch">
              <input type="checkbox" checked={readOnly} disabled={!configLoaded} onChange={event => toggleReadOnly(event.target.checked)} />
              <span />
            </span>
          </label>

          {configLoaded && !readOnly && !isWritable && (
            <div className="notice notice-bad">
              <XCircle size={18} />
              <div>
                <strong>Écriture impossible</strong>
                <p>Le système de fichiers refuse l’écriture : vérifiez les permissions, ou un montage en <code>:ro</code>.</p>
              </div>
            </div>
          )}
          {configLoaded && !readOnly && isWritable && (
            <div className="notice notice-ok">
              <CheckCircle2 size={18} />
              <span>Écriture opérationnelle : l’application peut modifier vos fichiers.</span>
            </div>
          )}
        </section>

        <section id="prowlarr" className={styles.section}>
          <h2 className="display">Indexeurs · Prowlarr</h2>
          <TextField id="prowlarr-url" label="URL" inputMode="url" value={prowlarrUrl} onChange={setProwlarrUrl} placeholder="http://nas:9696" />
          <SecretField id="prowlarr-key" label="Clé d’API" value={prowlarrApiKey} onChange={setProwlarrApiKey} placeholder="Clé d’API Prowlarr" />
          <div className={styles.actions}>
            <button type="button" className="btn btn-quiet" onClick={testProwlarr} disabled={busy !== null}>
              {busy === 'prowlarr-test' && <RefreshCw size={17} className="spin" />}
              Tester
            </button>
            <button type="button" className="btn btn-quiet" onClick={syncIndexers} disabled={busy !== null}>
              {spinner('prowlarr-sync', <RefreshCw size={17} />)}
              Synchroniser
            </button>
            <button type="button" className="btn btn-primary" onClick={saveProwlarr} disabled={busy !== null}>
              {spinner('prowlarr-save', <Save size={17} />)}
              Enregistrer
            </button>
          </div>
          {indexers.length > 0 && (
            <ul className={styles.indexers}>
              {indexers.map(indexer => (
                <li key={indexer.id} data-on={Boolean(indexer.enabled)}>
                  <span className={styles.dot} aria-label={indexer.enabled ? 'Actif' : 'Inactif'} />
                  <span className="clamp-1">{indexer.name}</span>
                  <span className={`mono ${styles.protocol}`}>{indexer.protocol}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="sabnzbd" className={styles.section}>
          <h2 className="display">Téléchargement · SABnzbd</h2>
          <TextField id="sab-url" label="URL" inputMode="url" value={sabUrl} onChange={setSabUrl} placeholder="http://nas:8080" />
          <SecretField id="sab-key" label="Clé d’API" value={sabApiKey} onChange={setSabApiKey} placeholder="Clé d’API SABnzbd" />
          <TextField id="sab-category" label="Catégorie" value={sabCategory} onChange={setSabCategory} placeholder="music" />
          <div className={styles.actions}>
            <button type="button" className="btn btn-quiet" onClick={testSab} disabled={busy !== null}>
              {busy === 'sab-test' && <RefreshCw size={17} className="spin" />}
              Tester
            </button>
            <button type="button" className="btn btn-primary" onClick={saveSab} disabled={busy !== null}>
              {spinner('sab-save', <Save size={17} />)}
              Enregistrer
            </button>
          </div>
        </section>

        <section id="deezer" className={styles.section}>
          <h2 className="display">Deezer</h2>
          <SecretField
            id="deezer-arl"
            label="Cookie ARL"
            value={deezerArl}
            onChange={setDeezerArl}
            placeholder="Votre cookie ARL"
            hint="Nécessaire au téléchargement direct : il se trouve dans les cookies de votre navigateur, sur deezer.com."
          />
          <div className={styles.field}>
            <label className="label" htmlFor="deezer-quality">
              Qualité de téléchargement
            </label>
            <select id="deezer-quality" className="input" value={deezerQuality} onChange={event => setDeezerQuality(event.target.value)}>
              <option value="MP3_128">MP3 128 kbps</option>
              <option value="MP3_320">MP3 320 kbps</option>
              <option value="FLAC">FLAC (sans perte)</option>
            </select>
          </div>
          <div className={styles.actions}>
            <button type="button" className="btn btn-primary" onClick={() => saveMetadata('deezer-save')} disabled={busy !== null}>
              {spinner('deezer-save', <Save size={17} />)}
              Enregistrer
            </button>
          </div>
        </section>

        <section id="discogs" className={styles.section}>
          <h2 className="display">Discogs</h2>
          <SecretField
            id="discogs-token"
            label="Jeton personnel"
            value={discogsToken}
            onChange={setDiscogsToken}
            placeholder="Votre jeton Discogs"
            hint={
              <>
                Créez-le dans vos{' '}
                <a href="https://www.discogs.com/settings/developers" target="_blank" rel="noopener noreferrer">
                  paramètres Discogs
                </a>
                .
              </>
            }
          />
          <div className={styles.actions}>
            <button type="button" className="btn btn-primary" onClick={() => saveMetadata('discogs-save')} disabled={busy !== null}>
              {spinner('discogs-save', <Save size={17} />)}
              Enregistrer
            </button>
          </div>
        </section>
      </div>

      <p className={`mono ${styles.colophon}`}>Musicarr v{version}, fait maison</p>
    </div>
  );
}
