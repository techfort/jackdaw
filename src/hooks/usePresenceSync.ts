import { useEffect, useRef } from 'react';
import { useStore } from '../store';

export const usePresenceSync = () => {
  const { currentTime, updatePresence, isSyncing, currentProjectId, currentSongId } = useStore();
  const lastUpdatedTime = useRef(0);
  const lastPos = useRef(0);

  useEffect(() => {
    if (!isSyncing || !currentProjectId || !currentSongId) return;

    const now = Date.now();
    // Send presence every 1s OR if position changed significantly (scrubbing)
    const significantChange = Math.abs(currentTime - lastPos.current) > 0.5;

    if (now - lastUpdatedTime.current > 1000 || significantChange) {
      updatePresence(currentTime);
      lastUpdatedTime.current = now;
      lastPos.current = currentTime;
    }
  }, [currentTime, isSyncing, currentProjectId, currentSongId, updatePresence]);
};
