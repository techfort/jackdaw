import { getSharedAudioContext } from './sharedAudioContext';

interface MonitorState {
  stream: MediaStream | null;
  source: MediaStreamAudioSourceNode | null;
  analyser: AnalyserNode | null;
  gainNode: GainNode | null;
  deviceId: string | null;
}

const state: MonitorState = {
  stream: null,
  source: null,
  analyser: null,
  gainNode: null,
  deviceId: null,
};

// Incremented on every stopInputMonitor() call. startInputMonitor checks this
// after its async getUserMedia() returns — if the generation changed while we
// were awaiting, a stop was requested and we must not use the new stream.
let generation = 0;

export async function startInputMonitor(
  deviceId: string | null,
  monitoringEnabled: boolean
): Promise<void> {
  stopInputMonitor();
  const myGeneration = generation;

  const constraints: MediaStreamConstraints = {
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    video: false,
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  // If stopInputMonitor() was called while we were awaiting getUserMedia,
  // immediately discard the stream so we don't create a concurrent stream.
  if (generation !== myGeneration) {
    stream.getTracks().forEach(t => t.stop());
    return;
  }
  const ctx = getSharedAudioContext();
  await ctx.resume();

  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.3;

  const gainNode = ctx.createGain();
  gainNode.gain.value = monitoringEnabled ? 0.8 : 0;

  source.connect(analyser);
  source.connect(gainNode);
  gainNode.connect(ctx.destination);

  state.stream = stream;
  state.source = source;
  state.analyser = analyser;
  state.gainNode = gainNode;
  state.deviceId = deviceId;
}

export function setMonitorGain(enabled: boolean): void {
  if (state.gainNode) {
    state.gainNode.gain.value = enabled ? 0.8 : 0;
  }
}

export function stopInputMonitor(): void {
  generation++;
  state.source?.disconnect();
  state.gainNode?.disconnect();
  state.analyser?.disconnect();
  state.stream?.getTracks().forEach(t => t.stop());

  state.source = null;
  state.gainNode = null;
  state.analyser = null;
  state.stream = null;
  state.deviceId = null;
}

export function getInputAnalyser(): AnalyserNode | null {
  return state.analyser;
}

export function getMonitorDeviceId(): string | null {
  return state.deviceId;
}
