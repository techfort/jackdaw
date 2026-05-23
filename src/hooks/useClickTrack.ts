import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { getSharedAudioContext } from '../lib/sharedAudioContext';

// Web Audio scheduler constants — schedule 100ms ahead, check every 25ms.
// This pattern decouples timing precision from the UI frame rate.
const SCHEDULE_AHEAD = 0.1; // seconds
const LOOKAHEAD_MS   = 25;  // ms

const scheduleClick = (ctx: AudioContext, time: number, isAccent: boolean) => {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'triangle';
  osc.frequency.value = isAccent ? 1000 : 800;

  // Sharp attack, fast exponential decay — percussive feel
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(isAccent ? 0.65 : 0.38, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.001, time + (isAccent ? 0.045 : 0.030));

  osc.start(time);
  osc.stop(time + 0.06);
};

export const useClickTrack = () => {
  const isPlaying      = useStore(state => state.isPlaying);
  const isClickEnabled = useStore(state => state.isClickEnabled);
  // currentTime and tempo are only needed at scheduler start — read the rest from store inside the interval
  const currentTime    = useStore(state => state.currentTime);
  const tempo          = useStore(state => state.tempo);

  const schedulerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextBeatTimeRef   = useRef(0); // ctx.currentTime of next pending beat
  const nextBeatIndexRef  = useRef(0); // absolute beat index (mod 4 gives bar position)

  useEffect(() => {
    if (!isPlaying || !isClickEnabled) {
      if (schedulerRef.current !== null) {
        clearInterval(schedulerRef.current);
        schedulerRef.current = null;
      }
      return;
    }

    const ctx          = getSharedAudioContext();
    const ctxAtStart   = ctx.currentTime;
    const songAtStart  = currentTime;
    const beatDuration = 60 / Math.max(1, tempo);

    // Map a song-time position to AudioContext time
    const songToCtx = (t: number) => ctxAtStart + (t - songAtStart);

    // First beat at or after the current song position
    const firstBeatIndex = Math.ceil(songAtStart / beatDuration);
    nextBeatTimeRef.current  = songToCtx(firstBeatIndex * beatDuration);
    nextBeatIndexRef.current = firstBeatIndex;

    const schedule = () => {
      const { tempo: liveTempo, isClickEnabled: liveEnabled } = useStore.getState();
      if (!liveEnabled) return;

      const bd = 60 / Math.max(1, liveTempo);

      while (nextBeatTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD) {
        scheduleClick(ctx, nextBeatTimeRef.current, nextBeatIndexRef.current % 4 === 0);
        nextBeatTimeRef.current  += bd;
        nextBeatIndexRef.current += 1;
      }
    };

    schedule(); // prime immediately so there's no gap at play start
    schedulerRef.current = setInterval(schedule, LOOKAHEAD_MS);

    return () => {
      if (schedulerRef.current !== null) {
        clearInterval(schedulerRef.current);
        schedulerRef.current = null;
      }
    };
  }, [isPlaying, isClickEnabled]); // tempo handled live inside schedule(); currentTime anchored at start only
};
