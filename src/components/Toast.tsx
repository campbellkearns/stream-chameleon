/**
 * Toast notifications
 *
 * Lightweight, app-wide toasts that replace blocking alert() calls.
 */

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  title: string;
  message?: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (title: string, message?: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 4000;

const TOAST_STYLES: Record<ToastType, { icon: typeof Info; iconClass: string; borderClass: string }> = {
  success: { icon: CheckCircle2, iconClass: 'text-emerald-400', borderClass: 'border-l-emerald-500' },
  error: { icon: AlertCircle, iconClass: 'text-red-400', borderClass: 'border-l-red-500' },
  info: { icon: Info, iconClass: 'text-accent-fg', borderClass: 'border-l-accent' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((title: string, message?: string, type: ToastType = 'info') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => dismiss(id), TOAST_DURATION_MS);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed top-20 right-4 left-4 sm:left-auto z-50 flex flex-col gap-2 sm:w-96 pointer-events-none"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const { icon: Icon, iconClass, borderClass } = TOAST_STYLES[toast.type];
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 p-4 rounded-lg bg-raised border border-line border-l-4 ${borderClass} shadow-lg`}
            >
              <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconClass}`} />
              <div className="flex-1 min-w-0 text-sm">
                <div className="font-semibold text-fg-strong">{toast.title}</div>
                {toast.message && <div className="text-fg-muted mt-0.5 break-words">{toast.message}</div>}
              </div>
              <button
                onClick={() => dismiss(toast.id)}
                className="text-fg-subtle hover:text-fg transition-colors"
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
