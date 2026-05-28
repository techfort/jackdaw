export interface CompatIssue {
  feature: string;
  severity: 'error' | 'warn';
  message: string;
}

export const checkBrowserCompat = (): CompatIssue[] => {
  const issues: CompatIssue[] = [];

  if (typeof AudioContext === 'undefined' && typeof (window as any).webkitAudioContext === 'undefined') {
    issues.push({ feature: 'Web Audio API', severity: 'error', message: 'Web Audio API not supported — playback and export unavailable.' });
  }

  if (typeof OfflineAudioContext === 'undefined' && typeof (window as any).webkitOfflineAudioContext === 'undefined') {
    issues.push({ feature: 'OfflineAudioContext', severity: 'error', message: 'OfflineAudioContext not available — export will not work.' });
  }

  if (typeof indexedDB === 'undefined') {
    issues.push({ feature: 'IndexedDB', severity: 'warn', message: 'IndexedDB not available — local storage mode will not work.' });
  }

  if (!window.isSecureContext) {
    issues.push({ feature: 'Secure Context', severity: 'warn', message: 'App is not in a secure context (HTTPS) — some APIs may be restricted.' });
  }

  if (typeof MediaRecorder === 'undefined') {
    issues.push({ feature: 'MediaRecorder', severity: 'warn', message: 'MediaRecorder not available — audio recording features may be limited.' });
  }

  return issues;
};

export const SUPPORTED_BROWSERS = [
  { name: 'Chrome', minVersion: 94 },
  { name: 'Firefox', minVersion: 93 },
  { name: 'Edge', minVersion: 94 },
  { name: 'Safari', minVersion: 15, notes: 'AudioContext.resume() requires a user gesture before first playback' },
];
