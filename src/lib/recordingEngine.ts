import { getSharedAudioContext } from './sharedAudioContext';

const WORKLET_CODE = `
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._active = true;
    this.port.onmessage = () => { this._active = false; };
  }
  process(inputs) {
    if (!this._active) return false;
    const input = inputs[0];
    if (input && input.length > 0) {
      const arrays = input.map(ch => {
        const copy = new Float32Array(ch.length);
        copy.set(ch);
        return copy;
      });
      this.port.postMessage(arrays, arrays.map(a => a.buffer));
    }
    return this._active;
  }
}
registerProcessor('jackdaw-recorder', RecorderProcessor);
`;

let workletContext: AudioContext | null = null;

async function ensureWorkletLoaded(ctx: AudioContext): Promise<void> {
  if (workletContext === ctx) return;
  const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    await ctx.audioWorklet.addModule(url);
    workletContext = ctx;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface RecordingSession {
  stream: MediaStream;
  stop(): Promise<AudioBuffer>;
}

export async function startCapture(deviceId: string | null): Promise<RecordingSession> {
  const constraints: MediaStreamConstraints = {
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    video: false,
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  const ctx = getSharedAudioContext();
  await ctx.resume();
  await ensureWorkletLoaded(ctx);

  const source = ctx.createMediaStreamSource(stream);
  const workletNode = new AudioWorkletNode(ctx, 'jackdaw-recorder');

  // A silent gain (value=0) connected to destination is required to keep the
  // worklet in the "actively processing" audio graph — without it, some browsers
  // skip calling process() entirely.
  const silentGain = ctx.createGain();
  silentGain.gain.value = 0;

  const chunks: Float32Array[][] = [];
  workletNode.port.onmessage = (e: MessageEvent) => {
    chunks.push(e.data as Float32Array[]);
  };

  source.connect(workletNode);
  workletNode.connect(silentGain);
  silentGain.connect(ctx.destination);

  return {
    stream,
    stop: async (): Promise<AudioBuffer> => {
      workletNode.port.postMessage('stop');

      // Wait for in-flight frames to flush from the audio thread's message queue.
      // 200ms covers 44100Hz / 128 samples ≈ 345 blocks/s → ~69 blocks of headroom.
      await new Promise<void>(resolve => setTimeout(resolve, 200));

      source.disconnect();
      workletNode.disconnect();
      silentGain.disconnect();
      stream.getTracks().forEach(t => t.stop());

      const channelCount = chunks[0]?.length ?? 1;
      const totalSamples = chunks.reduce((sum, frame) => sum + (frame[0]?.length ?? 0), 0);

      if (totalSamples === 0) {
        return ctx.createBuffer(1, 1, ctx.sampleRate);
      }

      const buffer = ctx.createBuffer(channelCount, totalSamples, ctx.sampleRate);
      for (let ch = 0; ch < channelCount; ch++) {
        const channelData = buffer.getChannelData(ch);
        let offset = 0;
        for (const frame of chunks) {
          const src = frame[ch] ?? new Float32Array(frame[0]?.length ?? 0);
          channelData.set(src, offset);
          offset += src.length;
        }
      }

      return buffer;
    },
  };
}
