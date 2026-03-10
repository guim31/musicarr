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

  // Metadata providers
  const [discogsToken, setDiscogsToken] = useState('');

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      // Fetch Prowlarr
      const pRes = await fetch('/api/prowlarr');
      const pData = await pRes.json();
      if (pData.config) {
        setProwlarrUrl(pData.config.url || '');
        setProwlarrApiKey(pData.config.apiKey || '');
      }
      if (pData.indexers) {
        setIndexers(pData.indexers);
      }

      // Fetch SABnzbd
      const sRes = await fetch('/api/sabnzbd');
      const sData = await sRes.json();
      if (sData) {
        setSabUrl(sData.url || '');
        setSabApiKey(sData.apiKey || '');
        setSabCategory(sData.category || '');
      }
      // Fetch Library
      const libRes = await fetch('/api/library');
      const libData = await libRes.json();
      if (libData) {
        setLibraryPath(libData.path || '');
        setLibraryStats(libData.stats || { artists: 0, albums: 0 });
      }

      // Fetch Metadata
      const metaRes = await fetch('/api/metadata');
      const metaData = await metaRes.json();
      if (metaData) {
        setDiscogsToken(metaData.discogsToken || '');
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

  const handleScanLibrary = async () => {
    setScanning(true);
    showToast('Scan de la bibliothèque en cours...', 'info');
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan' })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Scan terminé ! ${data.filesProcessed} fichiers traités.`, 'success');
        fetchConfig();
      }
    } catch (error) {
      console.error(error);
      showToast('Erreur lors du scan de la bibliothèque.', 'error');
    } finally {
      setScanning(false);
    }
  };

  const handleSaveMetadata = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discogsToken })
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
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className={styles.button} onClick={handleTestProwlarr} disabled={loading}>
            Tester la connexion
          </button>
          <button 
            className={styles.button} 
            style={{ backgroundColor: 'var(--success)' }} 
            onClick={handleSaveProwlarr}
            disabled={loading}
          >
            Sauvegarder & Sync
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
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className={styles.button} onClick={handleTestSab} disabled={loading}>
            Tester la connexion
          </button>
          <button 
            className={styles.button} 
            style={{ backgroundColor: 'var(--success)' }} 
            onClick={handleSaveSab}
            disabled={loading}
          >
            Sauvegarder les réglages
          </button>
        </div>
      </div>

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
        
        {libraryStats.artists > 0 && (
          <div style={{ marginBottom: '20px', display: 'flex', gap: '24px', fontSize: '0.85rem' }}>
            <div style={{ color: 'var(--text-muted)' }}>Artistes: <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>{libraryStats.artists}</span></div>
            <div style={{ color: 'var(--text-muted)' }}>Albums: <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>{libraryStats.albums}</span></div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button className={styles.button} onClick={handleSaveLibrary} disabled={loading || scanning}>
            Sauvegarder le chemin
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
      </div>

      <div className={styles.section}>
        <h2 className={styles.title}><Server size={24} color="var(--accent)" /> Fournisseurs de Métadonnées</h2>
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
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className={styles.button} onClick={handleSaveMetadata} disabled={loading}>
            <Save size={18} />
            <span style={{ marginLeft: '8px' }}>Sauvegarder</span>
          </button>
        </div>
      </div>
    </div>
  );
}
