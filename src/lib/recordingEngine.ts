import { getSharedAudioContext } from './sharedAudioContext';

export interface RecordingSession {
  stream: MediaStream;
  stop(): Promise<AudioBuffer>;
}

/**
 * Pick a MediaRecorder mimeType the current browser actually supports.
 * Chrome/Firefox → webm/opus, Safari → mp4/aac. Returns undefined to let the
 * browser choose its default if none of the preferred types are supported.
 */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find(t => MediaRecorder.isTypeSupported(t));
}

/** Peak absolute sample value across all channels — used to detect silent captures. */
function peakAmplitude(buffer: AudioBuffer): number {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]);
      if (a > peak) peak = a;
    }
  }
  return peak;
}

export async function startCapture(deviceId: string | null): Promise<RecordingSession> {
  const audioConstraints: MediaTrackConstraints = {
    // Disable all browser DSP — noise suppression, AGC and echo cancellation
    // operate in processing blocks and introduce periodic burst artifacts that
    // corrupt recordings in a DAW context.
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  if (deviceId) audioConstraints.deviceId = { exact: deviceId };

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: audioConstraints,
    video: false,
  });

  // Log exactly which microphone the browser handed us — invaluable when there
  // are multiple inputs and a recording comes back silent.
  const track = stream.getAudioTracks()[0];
  console.log(`[recording] capturing from: "${track?.label || 'unknown device'}"`, track?.getSettings?.());

  // MediaRecorder is the standard, reliable capture path. The previous
  // AudioWorklet + silent-gain approach captured silence on some setups
  // (zero-channel input quanta / mic-device contention), which surfaced as
  // empty stems. MediaRecorder records the live track to an encoded blob with
  // no graph plumbing required.
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e: BlobEvent) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  // timeslice so dataavailable fires periodically — guarantees we still get
  // data even if the final flush on stop() is delayed.
  recorder.start(250);

  return {
    stream,
    stop: (): Promise<AudioBuffer> => {
      const ctx = getSharedAudioContext();

      return new Promise<AudioBuffer>((resolve, reject) => {
        recorder.onerror = (e) => {
          stream.getTracks().forEach(t => t.stop());
          reject((e as unknown as { error?: Error }).error ?? new Error('MediaRecorder error'));
        };

        recorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
            if (blob.size === 0) {
              console.warn('[recording] captured 0 bytes — no audio was recorded.');
              resolve(ctx.createBuffer(1, 1, ctx.sampleRate));
              return;
            }

            const arrayBuffer = await blob.arrayBuffer();
            await ctx.resume();
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

            const peak = peakAmplitude(audioBuffer);
            console.log(
              `[recording] captured ${blob.size} bytes, ${audioBuffer.duration.toFixed(2)}s, peak ${peak.toFixed(4)}`
            );
            if (peak < 1e-4) {
              console.warn(
                '[recording] captured audio is silent (peak ≈ 0). Check that the correct ' +
                'input device is selected and not muted at the OS level.'
              );
            }

            resolve(audioBuffer);
          } catch (err) {
            reject(err);
          }
        };

        recorder.stop();
      });
    },
  };
}
