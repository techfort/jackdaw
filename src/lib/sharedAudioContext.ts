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
