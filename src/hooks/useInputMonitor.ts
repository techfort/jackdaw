import { useEffect } from 'react';
import { useStore } from '../store';
import {
  startInputMonitor,
  stopInputMonitor,
  setMonitorGain,
  getMonitorDeviceId,
} from '../lib/inputMonitor';

export function useInputMonitor(): void {
  const tracks = useStore(state => state.tracks);
  const selectedInputDeviceId = useStore(state => state.selectedInputDeviceId);
  const isMonitoring = useStore(state => state.isMonitoring);

  const hasArmedTrack = tracks.some(t => t.isArmed);

  // Start/stop the monitor stream when armed tracks or device changes
  useEffect(() => {
    if (!hasArmedTrack) {
      stopInputMonitor();
      return;
    }

    // Restart if device changed or not yet running
    if (getMonitorDeviceId() !== selectedInputDeviceId) {
      startInputMonitor(selectedInputDeviceId, isMonitoring).catch(err => {
        console.warn('Input monitor failed to start:', err);
      });
    }

    return () => {
      stopInputMonitor();
    };
  }, [hasArmedTrack, selectedInputDeviceId]);

  // Update gain when monitoring toggle changes without restarting stream
  useEffect(() => {
    setMonitorGain(isMonitoring);
  }, [isMonitoring]);
}
