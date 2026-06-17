import React, { useState, useRef, useEffect } from 'react';
import { Mic, ChevronDown, MicOff, Headphones } from 'lucide-react';
import { useStore } from '../store';

export const InputDeviceSelector: React.FC = () => {
  const availableInputDevices = useStore(state => state.availableInputDevices);
  const selectedInputDeviceId = useStore(state => state.selectedInputDeviceId);
  const setSelectedInputDeviceId = useStore(state => state.setSelectedInputDeviceId);
  const setAvailableInputDevices = useStore(state => state.setAvailableInputDevices);
  const isMonitoring = useStore(state => state.isMonitoring);
  const toggleMonitoring = useStore(state => state.toggleMonitoring);
  const tracks = useStore(state => state.tracks);
  const hasArmedTrack = tracks.some(t => t.isArmed);

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDevice = availableInputDevices.find(d => d.deviceId === selectedInputDeviceId);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const requestPermissionAndRefresh = async () => {
    try {
      // Requesting mic access populates device labels
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      const all = await navigator.mediaDevices.enumerateDevices();
      setAvailableInputDevices(all.filter(d => d.kind === 'audioinput'));
    } catch {
      // User denied — leave list as-is
    }
  };

  const displayLabel = (device: MediaDeviceInfo) =>
    device.label || `Input ${availableInputDevices.indexOf(device) + 1}`;

  if (availableInputDevices.length === 0) {
    return (
      <button
        onClick={requestPermissionAndRefresh}
        aria-label="Grant microphone access"
        title="Grant microphone access to see audio inputs"
        className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-white/5 transition-colors"
      >
        <MicOff size={13} />
        <span className="hidden sm:block">No input</span>
      </button>
    );
  }

  return (
    <div ref={containerRef} className="flex items-center gap-1">
      <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Audio input: ${selectedDevice ? displayLabel(selectedDevice) : 'None selected'}`}
        title="Select audio input device"
        className="flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] hover:text-white hover:bg-white/5 transition-colors max-w-[140px]"
      >
        <Mic size={12} className="shrink-0" />
        <span className="truncate hidden sm:block">
          {selectedDevice ? displayLabel(selectedDevice) : 'Select input'}
        </span>
        <ChevronDown size={10} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Audio input devices"
          className="absolute right-0 top-full mt-1 z-50 bg-[var(--color-bg-surface)] border border-[var(--color-border-main)] rounded-lg shadow-xl min-w-[200px] overflow-hidden py-1"
        >
          <p className="px-3 pt-1 pb-2 text-[8px] font-black uppercase tracking-widest text-[var(--color-text-muted)] border-b border-[var(--color-border-inner)] mb-1">
            Audio Input
          </p>
          {availableInputDevices.map(device => (
            <button
              key={device.deviceId}
              role="option"
              aria-selected={device.deviceId === selectedInputDeviceId}
              onClick={() => { setSelectedInputDeviceId(device.deviceId); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-[10px] font-medium transition-colors flex items-center gap-2 ${
                device.deviceId === selectedInputDeviceId
                  ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/10'
                  : 'text-[var(--color-text-muted)] hover:bg-white/5 hover:text-white'
              }`}
            >
              <Mic size={11} className="shrink-0" />
              <span className="truncate">{displayLabel(device)}</span>
            </button>
          ))}
        </div>
      )}
      </div>

      {hasArmedTrack && (
        <button
          onClick={toggleMonitoring}
          title={isMonitoring ? 'Disable input monitoring (software monitor adds ~10-30ms latency; prefer hardware monitoring)' : 'Enable input monitoring'}
          aria-pressed={isMonitoring}
          aria-label={isMonitoring ? 'Monitoring on' : 'Monitoring off'}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest transition-colors ${
            isMonitoring
              ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30'
              : 'text-[var(--color-text-muted)] hover:text-white hover:bg-white/5 border border-transparent'
          }`}
        >
          <Headphones size={12} />
          <span className="hidden sm:block">{isMonitoring ? 'Mon' : 'Mon'}</span>
        </button>
      )}
    </div>
  );
};
