import audioBufferToWav from 'audiobuffer-to-wav';
import { TrackData } from '../types';

export const exportMixdown = async (tracks: TrackData[], options?: { startTime?: number; endTime?: number; filename?: string }) => {
  if (tracks.length === 0) return;

  const tStart = Number(options?.startTime) || 0;
  const tEnd = options?.endTime !== undefined 
    ? Number(options.endTime) 
    : Math.max(...tracks.flatMap(t => (t.clips || []).map(clip => Number(clip.offset) + Number(clip.duration))), 0);
  
  if (isNaN(tStart) || isNaN(tEnd)) return;

  const totalDuration = Math.max(0, tEnd - tStart);
  if (totalDuration <= 0 || !isFinite(totalDuration)) return;

  const sampleRate = tracks[0].buffer?.sampleRate || 44100;
  
  // Ensure we have a valid number of samples
  const lengthInSamples = Math.ceil(totalDuration * sampleRate);
  if (isNaN(lengthInSamples) || lengthInSamples <= 0) return;

  const offlineCtx = new OfflineAudioContext(2, lengthInSamples, sampleRate);

  tracks.forEach(track => {
    if (!track.buffer || track.isMuted) return;
    
    const isSoloedSomewhere = tracks.some(t => t.isSoloed);
    const shouldBeHearable = !isSoloedSomewhere || track.isSoloed;
    
    if (!shouldBeHearable) return;

    (track.clips || []).forEach(clip => {
      if (clip.isMuted) return;
      
      const cStart = Number(clip.offset);
      const cEnd = Number(clip.offset) + Number(clip.duration);
      const cAudioStart = Number(clip.audioStart) || 0;

      if (isNaN(cStart) || isNaN(cEnd)) return;

      // Check if clip overlaps with export range
      if (cEnd <= tStart || cStart >= tEnd) return;

      const overlapStart = Math.max(tStart, cStart);
      const overlapEnd = Math.min(tEnd, cEnd);
      const overlapDuration = overlapEnd - overlapStart;

      if (overlapDuration <= 0 || !isFinite(overlapDuration)) return;

      const source = offlineCtx.createBufferSource();
      source.buffer = track.buffer;
      
      const gain = offlineCtx.createGain();
      gain.gain.value = Number(track.volume) || 0;
      
      source.connect(gain);
      gain.connect(offlineCtx.destination);
      
      const when = Math.max(0, cStart - tStart);
      const bufferOffset = cAudioStart + Math.max(0, tStart - cStart);
      
      // Final sanity check for AudioBufferSourceNode.start arguments
      if (isFinite(when) && isFinite(bufferOffset) && isFinite(overlapDuration)) {
        try {
          source.start(when, bufferOffset, overlapDuration);
        } catch (e) {
          console.error("Failed to start source for export:", e, { when, bufferOffset, overlapDuration });
        }
      }
    });
  });

  const renderedBuffer = await offlineCtx.startRendering();
  const wav = audioBufferToWav(renderedBuffer);
  const blob = new Blob([wav], { type: 'audio/wav' });
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = options?.filename
    ? `${options.filename}.wav`
    : `jackdaw-mixdown-${Date.now()}${options?.startTime !== undefined ? '-selection' : ''}.wav`;
  a.click();
  URL.revokeObjectURL(url);
};
