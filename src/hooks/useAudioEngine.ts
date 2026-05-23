import { useRef, useEffect } from 'react';
import { useStore } from '../store';
import { getSharedAudioContext, getTrackAnalyser } from '../lib/sharedAudioContext';

export const useAudioEngine = () => {
  const trackNodes = useRef<{ [clipId: string]: AudioBufferSourceNode }>({});
  const gainNodes = useRef<{ [clipId: string]: GainNode }>({});

  const {
    tracks,
    isPlaying,
    currentTime,
    setIsPlaying,
    setCurrentTime
  } = useStore();

  const stopAll = () => {
    Object.values(trackNodes.current).forEach((node: AudioBufferSourceNode) => {
      try {
        node.stop();
      } catch (e) {}
    });
    trackNodes.current = {};
  };

  const startPlayback = async (startTime: number) => {
    const ctx = getSharedAudioContext();

    stopAll();

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (e) {
        console.error('[AudioEngine] AudioContext resume failed:', e);
        return;
      }
    }

    const now = ctx.currentTime;

    tracks.forEach(track => {
      if (!track.buffer || track.isMuted) return;

      const isSoloedSomewhere = tracks.some(t => t.isSoloed);
      const shouldBeHearable = !isSoloedSomewhere || track.isSoloed;

      (track.clips || []).forEach(clip => {
        if (clip.isMuted || !shouldBeHearable) return;

        const source = ctx.createBufferSource();
        source.buffer = track.buffer!;

        const gain = ctx.createGain();
        gain.gain.value = track.volume;

        source.connect(gain);
        gain.connect(ctx.destination);
        
        try {
          const analyser = getTrackAnalyser(track.id);
          gain.connect(analyser);
        } catch (e) {
          console.error('[AudioEngine] failed to connect analyser node:', e);
        }

        const clipStart = clip.offset;
        const clipEnd = clip.offset + clip.duration;

        if (startTime < clipEnd) {
          const offsetInClip = Math.max(0, startTime - clipStart);
          const whenToStart = now + Math.max(0, clipStart - startTime);
          const startOffsetInSource = Number(clip.audioStart || 0) + offsetInClip;
          const durationToPlay = Math.max(0, clip.duration - offsetInClip);

          if (isFinite(whenToStart) && isFinite(startOffsetInSource) && isFinite(durationToPlay) && durationToPlay > 0) {
            try {
              source.start(whenToStart, startOffsetInSource, durationToPlay);
              trackNodes.current[clip.id] = source;
              gainNodes.current[clip.id] = gain;
            } catch (e) {
              console.error('[AudioEngine] source.start failed:', e, { whenToStart, startOffsetInSource, durationToPlay });
            }
          }
        }
      });
    });
  };

  useEffect(() => {
    if (isPlaying) {
      startPlayback(currentTime);

      const startTime = Date.now() / 1000 - currentTime;
      let animationFrame: number;

      const tick = () => {
        const newTime = Date.now() / 1000 - startTime;
        setCurrentTime(newTime);
        animationFrame = requestAnimationFrame(tick);
      };

      animationFrame = requestAnimationFrame(tick);

      return () => {
        cancelAnimationFrame(animationFrame);
        stopAll();
      };
    } else {
      stopAll();
    }
  }, [isPlaying]);

  // Handle Mute/Solo/Volume updates in real-time
  useEffect(() => {
    const ctx = getSharedAudioContext();
    tracks.forEach(track => {
      (track.clips || []).forEach(clip => {
        const gain = gainNodes.current[clip.id];
        if (gain) {
          const isSoloedSomewhere = tracks.some(t => t.isSoloed);
          const shouldBeHearable = !track.isMuted && !clip.isMuted && (!isSoloedSomewhere || track.isSoloed);
          gain.gain.setTargetAtTime(shouldBeHearable ? track.volume : 0, ctx.currentTime, 0.05);
        }
      });
    });
  }, [tracks]);

  return {};
};
