import { useEffect } from 'react';
import { useStore } from '../store';

export const useOnlineSync = () => {
  const setOnline = useStore(state => state.setOnline);
  const pushUpdate = useStore(state => state.pushUpdate);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      // Flush any writes that were queued while offline
      pushUpdate().catch(err => console.warn('[useOnlineSync] flush failed:', err));
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Sync initial state in case the browser was already offline at mount
    setOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline, pushUpdate]);
};
