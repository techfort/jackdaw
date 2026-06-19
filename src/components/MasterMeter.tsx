import React, { useEffect, useRef } from 'react';
import { getMasterAnalyser } from '../lib/sharedAudioContext';

/**
 * Live master output meter. Reads the master analyser's time-domain data each
 * frame, tracks peak level with fast-attack / slow-decay smoothing (modelled on
 * InputLevelMeter), and drives the two bars + dB readout imperatively so there
 * is no per-frame React render. Rests at 0 / -inf when nothing is playing.
 */
export const MasterMeter: React.FC = () => {
  const barLeftRef = useRef<HTMLDivElement>(null);
  const barRightRef = useRef<HTMLDivElement>(null);
  const dbRef = useRef<HTMLDivElement>(null);
  const levelRef = useRef(0);

  useEffect(() => {
    const analyser = getMasterAnalyser();
    const data = new Float32Array(analyser.fftSize);
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);

      analyser.getFloatTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
      }

      // Fast attack, slow decay.
      if (peak > levelRef.current) levelRef.current = peak;
      else levelRef.current = Math.max(0, levelRef.current - 0.02);

      const level = levelRef.current;
      const heightPct = Math.min(100, level * 100);
      const color =
        level > 0.95 ? '#ef4444' : level > 0.7 ? '#f59e0b' : 'var(--color-accent)';

      for (const bar of [barLeftRef.current, barRightRef.current]) {
        if (!bar) continue;
        bar.style.height = `${heightPct}%`;
        bar.style.backgroundColor = color;
      }

      if (dbRef.current) {
        dbRef.current.textContent =
          level > 0.0001 ? `${(20 * Math.log10(level)).toFixed(1)} dB` : '-inf dB';
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

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
