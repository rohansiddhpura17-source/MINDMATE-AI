import { useState, useEffect } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => {
    const manualOffline = localStorage.getItem('mindmate_manual_offline');
    if (manualOffline !== null) {
      return manualOffline === 'false';
    }
    return navigator.onLine;
  });

  useEffect(() => {
    const handleOnline = () => {
      const manualOffline = localStorage.getItem('mindmate_manual_offline');
      if (manualOffline !== 'true') setIsOnline(true);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const toggleOnline = () => {
    const newState = !isOnline;
    localStorage.setItem('mindmate_manual_offline', (!newState).toString());
    setIsOnline(newState);
  };

  return { isOnline, toggleOnline };
}
