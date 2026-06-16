import audioBufferToWav from 'audiobuffer-to-wav';
import { TrackData } from '../types';

export interface ExportResult {
  filename: string;
  durationS: number;
  expectedDurationS: number;
  renderTimeMs: number;
}

const DURATION_TOLERANCE_S = 0.01;

export const exportMixdown = async (
  tracks: TrackData[],
  options?: { startTime?: number; endTime?: number; filename?: string }
): Promise<ExportResult | null> => {
  if (tracks.length === 0) return null;

  const tStart = Number(options?.startTime) || 0;
  const tEnd = options?.endTime !== undefined
    ? Number(options.endTime)
    : Math.max(...tracks.flatMap(t => (t.clips || []).map(clip => Number(clip.offset) + Number(clip.duration))), 0);

  if (isNaN(tStart) || isNaN(tEnd)) return null;

  const totalDuration = Math.max(0, tEnd - tStart);
  if (totalDuration <= 0 || !isFinite(totalDuration)) return null;

  const sampleRate = tracks.flatMap(t => t.clips || []).find(c => c.buffer)?.buffer?.sampleRate ?? 44100;
  const lengthInSamples = Math.ceil(totalDuration * sampleRate);
  if (isNaN(lengthInSamples) || lengthInSamples <= 0) return null;

  const offlineCtx = new OfflineAudioContext(2, lengthInSamples, sampleRate);

  const isSoloedSomewhere = tracks.some(t => t.isSoloed);

  tracks.forEach(track => {
    if (track.isMuted) return;
    if (isSoloedSomewhere && !track.isSoloed) return;

    (track.clips || []).forEach(clip => {
      if (clip.isMuted || !clip.buffer) return;

      const cStart = Number(clip.offset);
      const cEnd = Number(clip.offset) + Number(clip.duration);
      const cAudioStart = Number(clip.audioStart) || 0;

      if (isNaN(cStart) || isNaN(cEnd)) return;
      if (cEnd <= tStart || cStart >= tEnd) return;

      const overlapStart = Math.max(tStart, cStart);
      const overlapEnd = Math.min(tEnd, cEnd);
      const overlapDuration = overlapEnd - overlapStart;

      if (overlapDuration <= 0 || !isFinite(overlapDuration)) return;

      const source = offlineCtx.createBufferSource();
      source.buffer = clip.buffer;

      const gain = offlineCtx.createGain();
      gain.gain.value = Number(track.volume) || 0;

      source.connect(gain);
      gain.connect(offlineCtx.destination);

      const when = Math.max(0, cStart - tStart);
      const bufferOffset = cAudioStart + Math.max(0, tStart - cStart);

      if (isFinite(when) && isFinite(bufferOffset) && isFinite(overlapDuration)) {
        try {
          source.start(when, bufferOffset, overlapDuration);
        } catch (e) {
          console.error('Failed to start source for export:', e, { when, bufferOffset, overlapDuration });
        }
      }
    });
  });

  const renderStart = performance.now();
  const renderedBuffer = await offlineCtx.startRendering();
  const renderTimeMs = Math.round(performance.now() - renderStart);

  // Validate rendered duration is within tolerance
  const durationDelta = Math.abs(renderedBuffer.duration - totalDuration);
  if (durationDelta > DURATION_TOLERANCE_S) {
    console.warn(`[export] Duration mismatch: expected ${totalDuration.toFixed(3)}s, got ${renderedBuffer.duration.toFixed(3)}s (delta ${durationDelta.toFixed(3)}s)`);
  }

  console.info(`[export] rendered ${renderedBuffer.duration.toFixed(2)}s in ${renderTimeMs}ms (${tracks.length} tracks)`);

  const wav = audioBufferToWav(renderedBuffer);
  const blob = new Blob([wav], { type: 'audio/wav' });

  const filename = options?.filename
    ? `${options.filename}.wav`
    : `jackdaw-mixdown-${Date.now()}${options?.startTime !== undefined ? '-selection' : ''}.wav`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  return { filename, durationS: renderedBuffer.duration, expectedDurationS: totalDuration, renderTimeMs };
};

export const exportStem = async (track: TrackData): Promise<ExportResult | null> => {
  const clipsWithAudio = (track.clips || []).filter(c => !c.isMuted && c.buffer);
  if (clipsWithAudio.length === 0) return null;

  const tEnd = Math.max(
    ...(track.clips || []).map(c => Number(c.offset) + Number(c.duration)),
    0
  );
  if (tEnd <= 0 || !isFinite(tEnd)) return null;

  const sampleRate = clipsWithAudio[0].buffer!.sampleRate;
  const lengthInSamples = Math.ceil(tEnd * sampleRate);
  if (lengthInSamples <= 0) return null;

  const offlineCtx = new OfflineAudioContext(2, lengthInSamples, sampleRate);

  (track.clips || []).forEach(clip => {
    if (clip.isMuted || !clip.buffer) return;

    const cStart = Number(clip.offset);
    const cAudioStart = Number(clip.audioStart) || 0;
    const cDuration = Number(clip.duration);

    if (!isFinite(cStart) || !isFinite(cDuration) || cDuration <= 0) return;

    const source = offlineCtx.createBufferSource();
    source.buffer = clip.buffer;

    const gain = offlineCtx.createGain();
    gain.gain.value = Number(track.volume) || 1;

    source.connect(gain);
    gain.connect(offlineCtx.destination);

    try {
      source.start(cStart, cAudioStart, cDuration);
    } catch (e) {
      console.error('exportStem: failed to start source', e);
    }
  });

  const renderStart = performance.now();
  const renderedBuffer = await offlineCtx.startRendering();
  const renderTimeMs = Math.round(performance.now() - renderStart);

  const wav = audioBufferToWav(renderedBuffer);
  const blob = new Blob([wav], { type: 'audio/wav' });
  const safeName = track.name.replace(/[^a-z0-9_-]/gi, '_');
  const filename = `jackdaw-stem-${safeName}-${Date.now()}.wav`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  return { filename, durationS: renderedBuffer.duration, expectedDurationS: tEnd, renderTimeMs };
};
