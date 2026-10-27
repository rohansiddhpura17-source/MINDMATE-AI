import { useState, useCallback, useRef } from 'react';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'info', durationMs?: number) => {
      const id = Math.random().toString(36).substring(2, 9);

      // If a success toast arrives, dismiss any existing transient 'info' loading toasts to prevent awkward double-stacking
      if (type === 'success') {
        setToasts((prev) => {
          prev.forEach((t) => {
            if (t.type === 'info') {
              const timer = timersRef.current.get(t.id);
              if (timer) clearTimeout(timer);
              timersRef.current.delete(t.id);
            }
          });
          return prev.filter((t) => t.type !== 'info');
        });
      }

      setToasts((prev) => [...prev, { id, message, type }]);

      const timeout = durationMs || (type === 'error' ? 6000 : type === 'info' ? 3000 : 3500);
      const timer = setTimeout(() => {
        removeToast(id);
      }, timeout);

      timersRef.current.set(id, timer);
    },
    [removeToast]
  );

  return { toasts, showToast, removeToast };
}
