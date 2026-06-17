import React, { useRef, useEffect } from 'react';
import { getInputAnalyser } from '../lib/inputMonitor';

export const InputLevelMeter: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef(0);
  const peakRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const dataBuffer = new Float32Array(1024);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const analyser = getInputAnalyser();
      let rawPeak = 0;

      if (analyser) {
        analyser.getFloatTimeDomainData(dataBuffer);
        for (let i = 0; i < dataBuffer.length; i++) {
          const abs = Math.abs(dataBuffer[i]);
          if (abs > rawPeak) rawPeak = abs;
        }
      }

      // Fast attack, slow decay
      if (rawPeak > levelRef.current) {
        levelRef.current = rawPeak;
      } else {
        levelRef.current = Math.max(0, levelRef.current - 0.018);
      }

      // Peak hold with slow decay
      if (rawPeak > peakRef.current) {
        peakRef.current = rawPeak;
      } else {
        peakRef.current = Math.max(0, peakRef.current - 0.003);
      }

      const level = levelRef.current;
      const isClipping = level > 0.95;

      const W = canvas.width;
      const H = canvas.height;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, W, H);

      if (level > 0) {
        const barW = Math.floor(level * W);
        ctx.fillStyle = isClipping ? '#ef4444' : level > 0.7 ? '#f59e0b' : '#22c55e';
        ctx.fillRect(0, 0, barW, H);
      }

      // Peak hold indicator
      if (peakRef.current > 0.01) {
        const px = Math.min(Math.floor(peakRef.current * W), W - 2);
        ctx.fillStyle = peakRef.current > 0.95 ? '#ef4444' : 'rgba(255,255,255,0.7)';
        ctx.fillRect(px, 0, 2, H);
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={6}
      className="w-full rounded-sm"
      aria-label="Input level"
      role="meter"
    />
  );
};
