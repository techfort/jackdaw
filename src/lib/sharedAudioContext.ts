/**
 * Singleton AudioContext shared across the app.
 * Using a single context for both decoding and playback avoids
 * cross-context AudioBuffer compatibility issues.
 */
let context: AudioContext | null = null;

export const getSharedAudioContext = (): AudioContext => {
  if (!context || context.state === 'closed') {
    context = new AudioContext();
  }
  return context;
};

const trackAnalysers = new Map<string, AnalyserNode>();
let masterAnalyser: AnalyserNode | null = null;

export const getMasterAnalyser = (): AnalyserNode => {
  const ctx = getSharedAudioContext();
  if (!masterAnalyser) {
    masterAnalyser = ctx.createAnalyser();
    masterAnalyser.fftSize = 2048;
  }
  return masterAnalyser;
};

export const getTrackAnalyser = (trackId: string): AnalyserNode => {
  const ctx = getSharedAudioContext();
  let analyser = trackAnalysers.get(trackId);
  if (!analyser) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    trackAnalysers.set(trackId, analyser);
  }
  return analyser;
};
