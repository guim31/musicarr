'use client';

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import Sheet from '@/components/ui/Sheet';

interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

/** `confirm()` du navigateur, en version qui ressemble à l'application et marche au pouce. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>(next => {
    resolver.current?.(false);
    setOptions(next);
    return new Promise(resolve => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Sheet
        open={options !== null}
        onClose={() => settle(false)}
        size="small"
        title={options?.title}
        footer={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => settle(false)}>
              {options?.cancelLabel ?? 'Annuler'}
            </button>
            <button
              type="button"
              className={`btn ${options?.danger ? 'btn-danger-solid' : 'btn-primary'}`}
              onClick={() => settle(true)}
            >
              {options?.confirmLabel ?? 'Confirmer'}
            </button>
          </>
        }
      >
        {options?.message && <div className="muted">{options.message}</div>}
      </Sheet>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm doit être utilisé dans un ConfirmProvider');
  return context;
}
