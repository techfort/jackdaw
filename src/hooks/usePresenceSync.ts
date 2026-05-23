import { useEffect, useRef } from 'react';
import { useStore } from '../store';

export const usePresenceSync = () => {
  const { currentTime, updatePresence, isSyncing, currentProjectId, currentSongId } = useStore();
  const lastUpdatedTime = useRef(0);
  const lastPos = useRef(0);

  useEffect(() => {
    if (!isSyncing || !currentProjectId || !currentSongId) return;

    const now = Date.now();
    // Strict 1s ceiling — no position-override that could spike writes during scrubbing
    if (now - lastUpdatedTime.current > 1000) {
      updatePresence(currentTime);
      lastUpdatedTime.current = now;
      lastPos.current = currentTime;
    }
  }, [currentTime, isSyncing, currentProjectId, currentSongId, updatePresence]);
};
