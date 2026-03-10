'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, XCircle, Info, AlertCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);

    // Auto remove after 5 seconds
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
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
            minWidth: '300px',
            maxWidth: '450px',
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '16px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            animation: 'slideIn 0.3s ease forwards',
            pointerEvents: 'auto'
          }}>
            <ToastIcon type={toast.type} />
            <span style={{ fontSize: '0.9375rem', fontWeight: 500, flex: 1 }}>{toast.message}</span>
            <button 
              onClick={() => removeToast(toast.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                borderRadius: '4px'
              }}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      <style jsx global>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        
        .toast-success { border-left: 4px solid var(--success) !important; }
        .toast-error { border-left: 4px solid var(--danger) !important; }
        .toast-info { border-left: 4px solid var(--accent) !important; }
        .toast-warning { border-left: 4px solid var(--warning) !important; }
      `}</style>
    </ToastContext.Provider>
  );
};

const ToastIcon = ({ type }: { type: ToastType }) => {
  switch (type) {
    case 'success': return <CheckCircle2 size={20} color="var(--success)" />;
    case 'error': return <XCircle size={20} color="var(--danger)" />;
    case 'warning': return <AlertCircle size={20} color="var(--warning)" />;
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
