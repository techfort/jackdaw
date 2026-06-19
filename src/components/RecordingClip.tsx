import React, { useEffect, useRef } from 'react';
import { useStore } from '../store';

interface RecordingClipProps {
  /** Timeline position (seconds) where the in-progress take began. */
  startTime: number;
}

/**
 * Clip-shaped bounding box rendered on an armed track while recording is in
 * progress. It is anchored at the timeline position where recording started and
 * grows in width in real time so the user can see a take is being captured and
 * on which track it will land.
 *
 * Width is driven imperatively via requestAnimationFrame (writing straight to
 * the DOM node) to avoid a store write / React render on every frame.
 *
 * Phase 2 (jackdaw-q65) renders a live waveform of the incoming audio inside
 * this box.
 */
export const RecordingClip: React.FC<RecordingClipProps> = ({ startTime }) => {
  const zoom = useStore(state => state.zoom);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const startedAt = performance.now();
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const box = boxRef.current;
      if (!box) return;
      const elapsed = (performance.now() - startedAt) / 1000;
      box.style.width = `${elapsed * zoom}px`;
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [zoom]);

  return (
    <div
      ref={boxRef}
      className="h-[80px] my-[16px] absolute rounded border-2 border-red-500 bg-red-500/10 z-20 pointer-events-none animate-pulse"
      style={{ left: (Number(startTime) || 0) * (Number(zoom) || 100), width: 0 }}
    >
      <span className="absolute top-1 left-2 flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest text-red-400">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        REC
      </span>
    </div>
  );
};
