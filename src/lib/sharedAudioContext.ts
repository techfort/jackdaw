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
let meterSink: GainNode | null = null;
// The context the meter nodes belong to. If the shared context is ever
// recreated (e.g. after being closed), the cached nodes belong to a dead
// context and must be dropped — otherwise connecting live nodes to them throws.
let meterContext: AudioContext | null = null;

const ensureMeterContext = (ctx: AudioContext): void => {
  if (meterContext !== ctx) {
    trackAnalysers.clear();
    masterAnalyser = null;
    meterSink = null;
    meterContext = ctx;
  }
};

/**
 * A silent (gain 0) sink connected to the destination. Analyser nodes are
 * connected to it so they have a path to the destination and are therefore
 * pulled by the render graph — without it, an analyser tapping a pull-based
 * AudioBufferSourceNode branch never receives data. It contributes no audio.
 */
const getMeterSink = (): GainNode => {
  const ctx = getSharedAudioContext();
  ensureMeterContext(ctx);
  if (!meterSink) {
    meterSink = ctx.createGain();
    meterSink.gain.value = 0;
    meterSink.connect(ctx.destination);
  }
  return meterSink;
};

export const getMasterAnalyser = (): AnalyserNode => {
  const ctx = getSharedAudioContext();
  ensureMeterContext(ctx);
  if (!masterAnalyser) {
    masterAnalyser = ctx.createAnalyser();
    masterAnalyser.fftSize = 2048;
    masterAnalyser.connect(getMeterSink());
  }
  return masterAnalyser;
};

export const getTrackAnalyser = (trackId: string): AnalyserNode => {
  const ctx = getSharedAudioContext();
  ensureMeterContext(ctx);
  let analyser = trackAnalysers.get(trackId);
  if (!analyser) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.connect(getMeterSink());
    trackAnalysers.set(trackId, analyser);
  }
  return analyser;
};
