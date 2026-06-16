import { useEffect } from 'react';
import { useStore } from '../store';

const refresh = async (setDevices: (d: MediaDeviceInfo[]) => void) => {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    setDevices(all.filter(d => d.kind === 'audioinput'));
  } catch {
    // Permission not yet granted — labels will be empty strings until the user grants mic access
    setDevices([]);
  }
};

export const useInputDevices = () => {
  const setAvailableInputDevices = useStore(state => state.setAvailableInputDevices);
  const setSelectedInputDeviceId = useStore(state => state.setSelectedInputDeviceId);
  const selectedInputDeviceId = useStore(state => state.selectedInputDeviceId);

  useEffect(() => {
    refresh(setAvailableInputDevices);

    const handleDeviceChange = () => refresh(setAvailableInputDevices);
    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [setAvailableInputDevices]);

  // Auto-select default device when list first populates and nothing is selected
  useEffect(() => {
    if (selectedInputDeviceId !== null) return;
    const devices = useStore.getState().availableInputDevices;
    const defaultDevice = devices.find(d => d.deviceId === 'default') ?? devices[0];
    if (defaultDevice) setSelectedInputDeviceId(defaultDevice.deviceId);
  }, [selectedInputDeviceId, setSelectedInputDeviceId]);
};
