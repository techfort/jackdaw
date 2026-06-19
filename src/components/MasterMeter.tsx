import React, { useRef } from 'react';
import { getMasterAnalyser } from '../lib/sharedAudioContext';
import { useMeter, meterColor } from '../hooks/useMeter';

/**
 * Live master output meter. Driven by the master analyser via useMeter; updates
 * the two bars + dB readout imperatively. Rests at 0 / -inf when nothing plays.
 */
export const MasterMeter: React.FC = () => {
  const barLeftRef = useRef<HTMLDivElement>(null);
  const barRightRef = useRef<HTMLDivElement>(null);
  const dbRef = useRef<HTMLDivElement>(null);

  useMeter(getMasterAnalyser, (level) => {
    const heightPct = Math.min(100, level * 100);
    const color = meterColor(level);
    for (const bar of [barLeftRef.current, barRightRef.current]) {
      if (!bar) continue;
      bar.style.height = `${heightPct}%`;
      bar.style.backgroundColor = color;
    }
    if (dbRef.current) {
      dbRef.current.textContent =
        level > 0.0001 ? `${(20 * Math.log10(level)).toFixed(1)} dB` : '-inf dB';
    }
  });

  return (
    <>
      <div className="flex gap-1 h-48 w-10 bg-[var(--color-bg-deep)] p-1 rounded border border-[var(--color-border-main)]">
        <div className="flex-1 bg-[var(--color-bg-input)] relative overflow-hidden">
          <div ref={barLeftRef} className="absolute bottom-0 w-full opacity-80" style={{ height: '0%' }} />
        </div>
        <div className="flex-1 bg-[var(--color-bg-input)] relative overflow-hidden">
          <div ref={barRightRef} className="absolute bottom-0 w-full opacity-80" style={{ height: '0%' }} />
        </div>
      </div>
      <div ref={dbRef} className="text-[10px] font-mono text-[var(--color-text-muted)]">-inf dB</div>
    </>
  );
};
