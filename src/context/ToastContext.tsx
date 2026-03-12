'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, XCircle, Info, AlertCircle, X, Download, Loader2 } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'download' | 'scan';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  progress?: number;
  details?: string;
  title?: string;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, id?: string) => void;
  updateToast: (id: string, updates: Partial<Toast>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenHistoryIds = React.useRef<Set<number>>(new Set());
  const isFirstPoll = React.useRef(true);

  const showToast = useCallback((message: string, type: ToastType = 'info', id?: string) => {
    const toastId = id || Math.random().toString(36).substring(2, 9);
    
    setToasts((prev) => {
      const exists = prev.find(t => t.id === toastId);
      if (exists) return prev;
      return [...prev, { id: toastId, type, message }];
    });

    // Auto remove after 5 seconds except for downloads
    if (type !== 'download') {
      setTimeout(() => {
        removeToast(toastId);
      }, 5000);
    }
  }, []);

  const updateToast = useCallback((id: string, updates: Partial<Toast>) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Poll for activity to update download toasts
  React.useEffect(() => {
    let interval: NodeJS.Timeout;

    const pollActivity = async () => {
      try {
        const res = await fetch('/api/activity');
        if (!res.ok) return;
        const data = await res.json();
        const activeDownloads = data.active || [];

        // For each active download, ensure a toast exists and is updated
        activeDownloads.forEach((item: any) => {
          const details = JSON.parse(item.details || '{}');
          const isDeemix = item.id.startsWith('local-') && item.type === 'download';
          
          let progress = 0;
          let label = "";
          
          if (isDeemix) {
            progress = details.total > 0 ? (details.current / details.total) * 100 : 0;
            label = `${details.current} / ${details.total} titres`;
          } else {
            progress = details.percentage || 0;
            label = `${details.speed || '0 KB/s'} - ${details.timeleft || ''}`;
          }

          const toastId = `dl-${item.id}`;
          
          setToasts((prev) => {
            const exists = prev.find(t => t.id === toastId);
            if (exists) {
              return prev.map(t => t.id === toastId ? {
                ...t,
                progress,
                details: label,
                message: item.title
              } : t);
            } else {
              // Only auto-add if it's a new download that wasn't there before
              return [...prev, {
                id: toastId,
                type: 'download',
                title: 'Téléchargement en cours',
                message: item.title,
                progress,
                details: label
              }];
            }
          });
        });

        // 2. Monitoring of History to notify about finished tasks
        const history = data.history || [];
        
        // Use a static-like property on the function to track seen IDs if possible, 
        // or better, a ref if we had one. But since we are inside useEffect, let's use a closure variable defined outside the effect or just a Ref.
        // Actually, I'll use a Ref defined at the top of the component.
        
        history.forEach((entry: any) => {
          // If we haven't seen this history entry yet
          if (!seenHistoryIds.current.has(entry.id)) {
            // If it's the first poll, just mark everything as seen
            if (isFirstPoll.current) {
               seenHistoryIds.current.add(entry.id);
               return;
            }

            // Only notify for items that just finished (completed or failed)
            // and were likely started recently (avoid notifying about very old history on reconnect)
            if (entry.status === 'completed') {
              showToast(`${entry.title} : Terminé avec succès`, 'success');
            } else if (entry.status === 'failed') {
              showToast(`${entry.title} : Échec. ${entry.message}`, 'error');
            }
            
            seenHistoryIds.current.add(entry.id);
          }
        });
        
        if (isFirstPoll.current) {
          isFirstPoll.current = false;
        }

        // Cleanup: remove download toasts that are no longer in active downloads
        setToasts((prev) => {
          return prev.filter(t => {
            if (t.type !== 'download' || !t.id.startsWith('dl-')) return true;
            const stillActive = activeDownloads.some((ad: any) => `dl-${ad.id}` === t.id);
            return stillActive;
          });
        });

      } catch (err) {
        console.error('Toast polling error:', err);
      }
    };

    interval = setInterval(pollActivity, 3000);
    return () => clearInterval(interval);
  }, []);

  // Poll for library scan progress
  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    let wasScanning = false;

    const pollScan = async () => {
      try {
        const res = await fetch(`/api/library?t=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json();
        
        if (data.progress) {
          wasScanning = true;
          const { processed, total } = data.progress;
          const isInitializing = total === -1;
          const progress = isInitializing ? 0 : (total > 0 ? (processed / total) * 100 : 0);
          const details = isInitializing ? 'Initialisation...' : `${processed} / ${total} fichiers`;
          
          setToasts((prev) => {
            const scanToast = prev.find(t => t.id === 'library-scan');
            if (scanToast) {
              return prev.map(t => t.id === 'library-scan' ? {
                ...t,
                progress,
                details,
                message: isInitializing ? 'Calcul de la taille de la bibliothèque...' : 'Analyse des fichiers musicaux...'
              } : t);
            } else {
              return [...prev, {
                id: 'library-scan',
                type: 'scan',
                title: 'Scan de la bibliothèque',
                message: 'Démarrage du scan...',
                progress,
                details
              }];
            }
          });
        } else if (wasScanning) {
          // Scan just finished
          wasScanning = false;
          removeToast('library-scan');
          showToast('Scan de la bibliothèque terminé !', 'success');
        }
      } catch (err) {
        console.error('Scan polling error:', err);
      }
    };

    interval = setInterval(pollScan, 2000);
    return () => clearInterval(interval);
  }, [showToast, removeToast]);

  return (
    <ToastContext.Provider value={{ showToast, updateToast, removeToast }}>
      {children}
      <div className="toast-container" style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        pointerEvents: 'none'
      }}>
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`} style={{
            minWidth: '320px',
            maxWidth: '450px',
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '16px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            pointerEvents: 'auto',
            overflow: 'hidden',
            backdropFilter: 'blur(10px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
              <ToastIcon type={toast.type} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{toast.title || 'Notification'}</span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>{toast.message}</span>
              </div>
              <button 
                onClick={() => removeToast(toast.id)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '6px',
                  display: 'flex',
                  borderRadius: '50%',
                  transition: 'all 0.2s'
                }}
              >
                <X size={14} />
              </button>
            </div>
            
            {(toast.type === 'download' || toast.type === 'scan') && typeof toast.progress === 'number' && (
              <div style={{ width: '100%', marginTop: '4px' }}>
                <div style={{ 
                  height: '8px', 
                  width: '100%', 
                  backgroundColor: 'rgba(0,0,0,0.3)', 
                  borderRadius: '4px',
                  overflow: 'hidden',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2)'
                }}>
                  <div style={{ 
                    width: `${toast.progress}%`, 
                    height: '100%', 
                    background: toast.type === 'download' 
                      ? 'linear-gradient(90deg, #a238ff, #ff3bce)'
                      : 'linear-gradient(90deg, var(--accent), #00d2ff)',
                    transition: 'width 0.4s cubic-bezier(0.1, 0.7, 0.1, 1)',
                    position: 'relative',
                    borderRadius: '4px'
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: 0, left: 0, right: 0, bottom: 0,
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                      animation: 'shimmer 2s infinite'
                    }} />
                  </div>
                </div>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  marginTop: '8px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  color: 'var(--text-muted)'
                }}>
                  <span style={{ color: 'var(--accent)' }}>{toast.details || 'Progression...'}</span>
                  <span style={{ color: toast.type === 'download' ? '#ff3bce' : 'var(--accent)' }}>{Math.round(toast.progress)}%</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <style jsx global>{`
        @keyframes slideIn {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .animate-spin {
          animation: spin 1s linear infinite;
        }
        
        .toast-success { border-left: 4px solid var(--success) !important; }
        .toast-error { border-left: 4px solid var(--danger) !important; }
        .toast-info { border-left: 4px solid var(--accent) !important; }
        .toast-warning { border-left: 4px solid var(--warning) !important; }
        .toast-download { border-left: 4px solid #a238ff !important; }
        .toast-scan { border-left: 4px solid var(--accent) !important; }
      `}</style>
    </ToastContext.Provider>
  );
};

const ToastIcon = ({ type }: { type: ToastType }) => {
  switch (type) {
    case 'success': return <CheckCircle2 size={20} color="var(--success)" />;
    case 'error': return <XCircle size={20} color="var(--danger)" />;
    case 'warning': return <AlertCircle size={20} color="var(--warning)" />;
    case 'download': return <Download size={20} color="#a238ff" />;
    case 'scan': return <Loader2 size={20} color="var(--accent)" className="animate-spin" />;
    default: return <Info size={20} color="var(--accent)" />;
  }
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
