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

export const getTrackAnalyser = (trackId: string): AnalyserNode => {
  const ctx = getSharedAudioContext();
  let analyser = trackAnalysers.get(trackId);
  if (!analyser) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    trackAnalysers.set(trackId, analyser);
  }
  return analyser;
};
