import { useCallback, useEffect, useRef, useState } from "react";

interface ToastMessage {
  id: number;
  message: string;
}

export function useToastController() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastIdRef = useRef(0);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast((current) => (current && current.id === toast.id ? null : current));
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showToast = useCallback((message: string) => {
    if (!message) return;
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, message });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  return { toast, showToast, dismissToast };
}
