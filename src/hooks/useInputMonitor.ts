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
  const isRecording = useStore(state => state.isRecording);

  const hasArmedTrack = tracks.some(t => t.isArmed);

  // Stop the monitor stream during active recording to avoid two concurrent
  // getUserMedia streams on the same device (causes resource contention / noisy captures).
  // The stream restarts automatically once isRecording goes false (after the
  // recording stream has been fully closed).
  useEffect(() => {
    if (!hasArmedTrack || isRecording) {
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
  }, [hasArmedTrack, selectedInputDeviceId, isRecording]);

  // Update gain when monitoring toggle changes without restarting stream
  useEffect(() => {
    setMonitorGain(isMonitoring);
  }, [isMonitoring]);
}
