'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Info, X } from 'lucide-react';
import styles from './Toast.module.css';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  type: ToastType;
  title?: string;
  message: string;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const DURATION: Record<ToastType, number> = {
  success: 4500,
  info: 4500,
  warning: 7000,
  error: 9000,
};

const ICONS: Record<ToastType, React.ComponentType<{ size?: number }>> = {
  success: Check,
  info: Info,
  warning: AlertTriangle,
  error: AlertTriangle,
};

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const layer = useRef<HTMLDivElement>(null);

  const dismiss = useCallback((id: number) => {
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', title?: string) => {
      const id = nextId++;
      setToasts(current => [...current.slice(-1), { id, type, message, title }]);
      setTimeout(() => dismiss(id), DURATION[type]);
    },
    [dismiss],
  );

  // Une modale native vit dans la « top layer », au-dessus de tout z-index : sans
  // repasser au premier plan, un message serait caché derrière la modale ouverte.
  useEffect(() => {
    const element = layer.current;
    if (!element?.showPopover) return;
    if (element.matches(':popover-open')) element.hidePopover();
    if (toasts.length > 0) element.showPopover();
  }, [toasts]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div ref={layer} popover="manual" className={styles.layer} role="status" aria-live="polite">
        {toasts.map(toast => {
          const Icon = ICONS[toast.type];
          return (
            <div key={toast.id} className={styles.toast} data-type={toast.type}>
              <span className={styles.icon}>
                <Icon size={16} />
              </span>
              <div className={styles.body}>
                {toast.title && <strong>{toast.title}</strong>}
                <span>{toast.message}</span>
              </div>
              <button type="button" className={styles.close} onClick={() => dismiss(toast.id)} aria-label="Fermer ce message">
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast doit être utilisé dans un ToastProvider');
  return context;
}
