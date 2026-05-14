'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type ToastKind = 'success' | 'error' | 'info' | 'warn';
type Toast = { id: number; kind: ToastKind; message: string };

type ToastCtx = {
  push: (msg: string, kind?: ToastKind, opts?: { durationMs?: number }) => void;
  confirm: (msg: string, opts?: { confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
};

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<{
    message: string; confirmLabel: string; danger: boolean;
    resolve: (yes: boolean) => void;
  } | null>(null);

  const push = useCallback((message: string, kind: ToastKind = 'info', opts?: { durationMs?: number }) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, message }]);
    const dur = opts?.durationMs ?? (kind === 'error' ? 6000 : 3500);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), dur);
  }, []);

  const confirm = useCallback((message: string, opts?: { confirmLabel?: string; danger?: boolean }) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({
        message,
        confirmLabel: opts?.confirmLabel ?? 'Confirm',
        danger: !!opts?.danger,
        resolve,
      });
    });
  }, []);

  function handleConfirmClick(yes: boolean) {
    if (confirmState) {
      confirmState.resolve(yes);
      setConfirmState(null);
    }
  }

  return (
    <Ctx.Provider value={{ push, confirm }}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span className="toast-mark" />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
      {confirmState && (
        <div className="modal-backdrop" onClick={() => handleConfirmClick(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">{confirmState.message}</div>
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => handleConfirmClick(false)}>Cancel</button>
              <button
                className={`btn ${confirmState.danger ? 'danger' : ''}`}
                onClick={() => handleConfirmClick(true)}
                autoFocus
              >{confirmState.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
