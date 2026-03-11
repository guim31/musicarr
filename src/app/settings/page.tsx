'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Download, 
  Server,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Save
} from 'lucide-react';
import styles from './Settings.module.css';
import { useToast } from '@/context/ToastContext';

export default function SettingsPage() {
  // Prowlarr state
  const [prowlarrUrl, setProwlarrUrl] = useState('');
  const [prowlarrApiKey, setProwlarrApiKey] = useState('');
  const [indexers, setIndexers] = useState<any[]>([]);
  
  // SABnzbd state
  const [sabUrl, setSabUrl] = useState('');
  const [sabApiKey, setSabApiKey] = useState('');
  const [sabCategory, setSabCategory] = useState('music');

  // Library state
  const [libraryPath, setLibraryPath] = useState('');
  const [libraryStats, setLibraryStats] = useState({ artists: 0, albums: 0 });
  const [readOnly, setReadOnly] = useState(true);
  const [isWritable, setIsWritable] = useState(false);
  const [previewFolders, setPreviewFolders] = useState<string[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewError, setPreviewError] = useState('');
  const [previewing, setPreviewing] = useState(false);

  // Metadata providers
  const [discogsToken, setDiscogsToken] = useState('');
  const [deezerArl, setDeezerArl] = useState('');
  const [deezerQuality, setDeezerQuality] = useState('MP3_320');

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ processed: number, total: number } | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (scanning) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/library?t=${Date.now()}`);
          if (res.ok) {
            const data = await res.json();
            if (data.progress) {
              setScanProgress(data.progress);
              if (data.stats) setLibraryStats(data.stats);
            } else if (scanning && scanProgress && scanProgress.total !== -1) {
              // Si la progression a disparu et qu'on n'est plus en phase d'initialisation (-1), le scan est fini
              setScanning(false);
              setScanProgress(null);
              if (data.stats) setLibraryStats(data.stats);
              clearInterval(interval);
            }
          }
        } catch (e) {}
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [scanning, scanProgress, showToast]);

  const fetchConfig = async () => {
    try {
      const ts = Date.now();
      
      // Fetch Prowlarr
      const pRes = await fetch(`/api/prowlarr?t=${ts}`);
      const pData = await pRes.json();
      if (pData.config) {
        setProwlarrUrl(pData.config.url || '');
        setProwlarrApiKey(pData.config.apiKey || '');
      }
      if (pData.indexers) {
        setIndexers(pData.indexers);
      }

      // Fetch SABnzbd
      const sRes = await fetch(`/api/sabnzbd?t=${ts}`);
      const sData = await sRes.json();
      if (sData) {
        setSabUrl(sData.url || '');
        setSabApiKey(sData.apiKey || '');
        setSabCategory(sData.category || '');
      }
      // Fetch Library
      const libRes = await fetch(`/api/library?t=${ts}`);
      const libData = await libRes.json();
      if (libData) {
        setLibraryPath(libData.path || '');
        setLibraryStats(libData.stats || { artists: 0, albums: 0 });
        setReadOnly(libData.readOnly ?? true);
        setIsWritable(libData.isWritable || false);
        if (libData.progress) {
          setScanning(true);
          setScanProgress(libData.progress);
        }
      }

      // Fetch Metadata
      const metaRes = await fetch(`/api/metadata?t=${ts}`);
      const metaData = await metaRes.json();
      if (metaData) {
        setDiscogsToken(metaData.discogsToken || '');
        setDeezerArl(metaData.deezerArl || '');
        setDeezerQuality(metaData.deezerQuality || 'MP3_320');
      }
    } catch (error) {
      console.error('Failed to fetch config', error);
    }
  };

  const handleTestProwlarr = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/prowlarr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: prowlarrUrl, apiKey: prowlarrApiKey, action: 'test' })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Connexion réussie à Prowlarr !', 'success');
      } else {
        showToast('Échec de la connexion Prowlarr. Vérifiez l\'URL et la clé API.', 'error');
      }
    } catch (error) {
      showToast('Erreur lors du test de connexion Prowlarr.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProwlarr = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/prowlarr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: prowlarrUrl, apiKey: prowlarrApiKey, action: 'save' })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Configuration Prowlarr enregistrée ! ${data.indexersSynced || 0} indexeurs synchronisés.`, 'success');
        fetchConfig();
      }
    } catch (error) {
      showToast('Erreur lors de l\'enregistrement Prowlarr.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTestSab = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sabnzbd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sabUrl, apiKey: sabApiKey, action: 'test' })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Connexion réussie à SABnzbd !', 'success');
      } else {
        showToast('Échec de la connexion SABnzbd. Vérifiez l\'URL et la clé API.', 'error');
      }
    } catch (error) {
      showToast('Erreur lors du test de connexion SABnzbd.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSab = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sabnzbd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sabUrl, apiKey: sabApiKey, category: sabCategory, action: 'save' })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Configuration SABnzbd enregistrée !', 'success');
      }
    } catch (error) {
      showToast('Erreur lors de l\'enregistrement SABnzbd.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncIndexers = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/prowlarr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`${data.count} indexeurs synchronisés avec succès.`, 'success');
        fetchConfig();
      }
    } catch (error) {
      showToast('Erreur lors de la synchronisation.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveLibrary = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_path', path: libraryPath })
      });
      if (res.ok) {
        showToast('Chemin de la bibliothèque enregistré.', 'success');
      }
    } catch (error) {
      showToast('Erreur lors de l\'enregistrement de la bibliothèque.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleReadOnly = async (value: boolean) => {
    setReadOnly(value);
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_read_only', value })
      });
      if (res.ok) {
        showToast(value ? 'Mode lecture seule activé.' : 'Mode écriture activé.', 'info');
      }
    } catch (e) {
      showToast('Erreur lors du changement de mode.', 'error');
    }
  };

  const handlePreviewPath = async () => {
    if (!libraryPath) return;
    setPreviewing(true);
    setPreviewError('');
    setPreviewFolders([]);
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview_path', path: libraryPath })
      });
      const data = await res.json();
      if (data.success) {
        setPreviewFolders(data.folders || []);
        setPreviewTotal(data.total || 0);
      } else {
        setPreviewError(data.error || 'Erreur de prévisualisation');
      }
    } catch (e) {
      setPreviewError('Erreur réseau lors de la prévisualisation.');
    } finally {
      setPreviewing(false);
    }
  };

  const handleScanLibrary = async () => {
    setScanning(true);
    setScanProgress({ processed: 0, total: -1 }); // -1 indique "Calcul en cours..."
    showToast('Démarrage du scan de la bibliothèque...', 'info');
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan' })
      });
      const data = await res.json();
      if (!data.success) {
        setScanning(false);
        setScanProgress(null);
        showToast('Erreur au démarrage du scan.', 'error');
      }
    } catch (error) {
      console.error(error);
      setScanning(false);
      setScanProgress(null);
      showToast('Erreur réseau lors du scan.', 'error');
    }
  };

  const handleSaveMetadata = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discogsToken, deezerArl, deezerQuality })
      });
      if (res.ok) {
        showToast('Paramètres métadonnées enregistrés.', 'success');
      }
    } catch (error) {
      showToast('Erreur lors de l\'enregistrement des métadonnées.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <header style={{ marginBottom: '32px' }}>
        <h1>Configuration</h1>
        <p style={{ color: 'var(--text-muted)' }}>Gérez vos indexeurs et vos clients de téléchargement.</p>
      </header>

            <div className={styles.section}>
        <h2 className={styles.title}><Server size={24} color="var(--accent)" /> Bibliothèque</h2>
        <div className={styles.formGroup}>
          <label className={styles.label}>Chemin de la musique (NAS)</label>
          <input 
            className={styles.input} 
            type="text" 
            placeholder="/app/music" 
            value={libraryPath}
            onChange={(e) => setLibraryPath(e.target.value)}
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            💡 Dans Docker, utilisez le chemin interne du container : <strong>/app/music</strong> (mappé dans le docker-compose).
          </p>
        </div>
        
        {previewError && (
          <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <XCircle size={16} /> {previewError}
          </div>
        )}
        
        {previewFolders.length > 0 && (
          <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: 'var(--background)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
             <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 500 }}>
               <CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px', color: 'var(--success)' }}/>
               Dossier valide. {previewTotal} dossiers trouvés :
             </p>
             <ul style={{ margin: 0, paddingLeft: '24px', fontSize: '0.85rem', color: 'var(--foreground)' }}>
               {previewFolders.map(f => <li key={f} style={{ marginBottom: '4px' }}>{f}</li>)}
               {previewTotal > previewFolders.length && <li style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>...et {previewTotal - previewFolders.length} autres</li>}
             </ul>
          </div>
        )}

        {libraryStats.artists > 0 && !previewFolders.length && !previewError && (
          <div style={{ marginBottom: '20px', display: 'flex', gap: '24px', fontSize: '0.85rem' }}>
            <div style={{ color: 'var(--text-muted)' }}>Artistes: <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>{libraryStats.artists}</span></div>
            <div style={{ color: 'var(--text-muted)' }}>Albums: <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>{libraryStats.albums}</span></div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className={`${styles.button} ${styles.outlineButton}`} 
              onClick={handlePreviewPath} 
              disabled={previewing || !libraryPath}
            >
              {previewing ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              <span style={{ marginLeft: '8px' }}>Aperçu des dossiers</span>
            </button>
            <button 
              className={styles.button} 
              style={{ backgroundColor: 'var(--accent)' }} 
              onClick={handleScanLibrary}
              disabled={loading || scanning || !libraryPath}
            >
              {scanning ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              <span style={{ marginLeft: '8px' }}>Lancer le Scan</span>
            </button>
          </div>
          <button 
            className={styles.button} 
            onClick={handleSaveLibrary} 
            disabled={loading || scanning}
            style={{ backgroundColor: 'var(--success)' }}
          >
            <Save size={18} />
            <span style={{ marginLeft: '8px' }}>Sauvegarder</span>
          </button>
        </div>

        {scanning && scanProgress && (
          <div style={{ marginTop: '20px', padding: '16px', backgroundColor: 'var(--background)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.85rem', fontWeight: 500 }}>
              <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Loader2 size={16} className="animate-spin" />
                {scanProgress.total === -1 ? 'Initialisation...' : 'Analyse en cours...'}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>
                {scanProgress.total === -1 ? '' : `${scanProgress.processed} / ${scanProgress.total}`}
              </span>
            </div>
            <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ 
                height: '100%', 
                width: `${Math.max(0, Math.min(100, scanProgress.total <= 0 ? 0 : (scanProgress.processed / scanProgress.total) * 100))}%`, 
                backgroundColor: 'var(--accent)', 
                transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)' 
              }} />
            </div>
          </div>
        )}

        <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
          <h3 style={{ fontSize: '0.9rem', marginBottom: '16px', fontWeight: 600 }}>Gestion des fichiers</h3>
          
          <div className={styles.switchContainer}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.9375rem' }}>Mode Lecture Seule</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Empêche l'application de créer des dossiers ou de modifier les tags.
              </div>
            </div>
            <label className={styles.switch}>
              <input 
                type="checkbox" 
                checked={readOnly} 
                onChange={(e) => handleToggleReadOnly(e.target.checked)}
              />
              <span className={styles.slider}></span>
            </label>
          </div>

          {!readOnly && !isWritable && (
            <div className={`${styles.infoBox} ${styles.infoBoxWarning}`}>
              <XCircle size={18} style={{ flexShrink: 0 }} />
              <div>
                <strong>Accès écriture impossible</strong>
                <p style={{ marginTop: '4px', opacity: 0.9 }}>
                  Bien que le mode écriture soit activé dans l'application, le système de fichiers (Docker) bloque l'écriture. 
                  Vérifiez vos permissions ou retirez le flag <code>:ro</code> dans votre docker-compose.
                </p>
              </div>
            </div>
          )}

          {!readOnly && isWritable && (
            <div className={`${styles.infoBox} ${styles.infoBoxSuccess}`}>
              <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
              <div>
                <strong>Mode écriture opérationnel</strong>
                <p style={{ marginTop: '4px', opacity: 0.9 }}>
                  L'application a les permissions nécessaires pour modifier vos fichiers.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>


      <div className={styles.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 className={styles.title} style={{ marginBottom: 0 }}>
            <Search size={24} color="var(--accent)" /> Indexeurs (Prowlarr)
          </h2>
          <button 
            className={styles.button} 
            style={{ backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)' }}
            onClick={handleSyncIndexers}
            disabled={syncing}
          >
            {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            <span style={{ marginLeft: '8px' }}>Sync Indexeurs</span>
          </button>
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.label}>URL Prowlarr</label>
          <input 
            className={styles.input} 
            type="text" 
            value={prowlarrUrl}
            onChange={(e) => setProwlarrUrl(e.target.value)}
            placeholder="http://192.168.1.50:9696" 
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Clé API</label>
          <input 
            className={styles.input} 
            type="password" 
            value={prowlarrApiKey}
            onChange={(e) => setProwlarrApiKey(e.target.value)}
            placeholder="Clé API Prowlarr" 
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
          <button className={styles.button} onClick={handleTestProwlarr} disabled={loading}>
            Tester la connexion
          </button>
          <button 
            className={styles.button} 
            onClick={handleSaveProwlarr}
            disabled={loading}
            style={{ backgroundColor: 'var(--success)' }}
          >
            <Save size={18} />
            <span style={{ marginLeft: '8px' }}>Sauvegarder & Sync</span>
          </button>
        </div>

        {indexers.length > 0 && (
          <div style={{ marginTop: '32px' }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase' }}>Indexeurs synchronisés</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {indexers.map((idx) => (
                <div key={idx.id} style={{ 
                  padding: '12px', 
                  backgroundColor: 'var(--background)', 
                  border: '1px solid var(--border)', 
                  borderRadius: 'var(--radius)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <div style={{ 
                    width: '8px', 
                    height: '8px', 
                    borderRadius: '50%', 
                    backgroundColor: idx.enabled ? 'var(--success)' : 'var(--text-muted)' 
                  }} />
                  <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{idx.name}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{idx.protocol}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={styles.section}>
        <h2 className={styles.title}><Download size={24} color="var(--accent)" /> Téléchargement (SABnzbd)</h2>
        <div className={styles.formGroup}>
          <label className={styles.label}>URL SABnzbd</label>
          <input 
            className={styles.input} 
            type="text" 
            value={sabUrl}
            onChange={(e) => setSabUrl(e.target.value)}
            placeholder="http://192.168.1.50:8080" 
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Clé API</label>
          <input 
            className={styles.input} 
            type="password" 
            value={sabApiKey}
            onChange={(e) => setSabApiKey(e.target.value)}
            placeholder="Clé API SABnzbd" 
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Catégorie</label>
          <input 
            className={styles.input} 
            type="text" 
            value={sabCategory}
            onChange={(e) => setSabCategory(e.target.value)}
            placeholder="music" 
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
          <button className={styles.button} onClick={handleTestSab} disabled={loading}>
            Tester la connexion
          </button>
          <button 
            className={styles.button} 
            onClick={handleSaveSab}
            disabled={loading}
            style={{ backgroundColor: 'var(--success)' }}
          >
            <Save size={18} />
            <span style={{ marginLeft: '8px' }}>Sauvegarder</span>
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.title}><Server size={24} color="var(--accent)" /> Deezer / Deemix</h2>
        <div className={styles.formGroup}>
          <label className={styles.label}>Deezer ARL Cookie</label>
          <input 
            className={styles.input} 
            type="password" 
            placeholder="Votre cookie ARL Deezer" 
            value={deezerArl}
            onChange={(e) => setDeezerArl(e.target.value)}
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            🔑 Nécessaire pour le téléchargement direct. Récupérez-le dans les cookies de votre navigateur sur deezer.com.
          </p>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Qualité de téléchargement</label>
          <select 
            className={styles.input}
            value={deezerQuality}
            onChange={(e) => setDeezerQuality(e.target.value)}
            style={{ appearance: 'none' }}
          >
            <option value="MP3_128">MP3 128kbps</option>
            <option value="MP3_320">MP3 320kbps (HQ)</option>
            <option value="FLAC">FLAC (Lossless)</option>
          </select>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button 
            className={styles.button} 
            onClick={handleSaveMetadata} 
            disabled={loading}
            style={{ backgroundColor: 'var(--success)' }}
          >
            <Save size={18} />
            <span style={{ marginLeft: '8px' }}>Sauvegarder</span>
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.title}><Server size={24} color="var(--accent)" /> Discogs</h2>
        <div className={styles.formGroup}>
          <label className={styles.label}>Discogs Personal Token</label>
          <input 
            className={styles.input} 
            type="password" 
            placeholder="Votre jeton Discogs" 
            value={discogsToken}
            onChange={(e) => setDiscogsToken(e.target.value)}
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            📀 Pour de meilleurs résultats sur les releases spécifiques, créez un jeton dans vos <a href="https://www.discogs.com/settings/developers" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>paramètres Discogs</a>.
          </p>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button 
            className={styles.button} 
            onClick={handleSaveMetadata} 
            disabled={loading}
            style={{ backgroundColor: 'var(--success)' }}
          >
            <Save size={18} />
            <span style={{ marginLeft: '8px' }}>Sauvegarder</span>
          </button>
        </div>
      </div>
    </div>
  );
}
