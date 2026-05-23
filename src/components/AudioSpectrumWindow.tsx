import React, { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { getSharedAudioContext, getTrackAnalyser, getMasterAnalyser } from '../lib/sharedAudioContext';

const LABEL_HEIGHT = 18;
const FREQ_LABELS = [20, 100, 500, 1000, 2000, 5000, 10000, 20000];
const ACTIVE_BIN_RATIO = 0.85;

export const AudioSpectrumWindow: React.FC = () => {
  const isSpectrumOpen = useStore(state => state.isSpectrumOpen);
  const setSpectrumOpen = useStore(state => state.setSpectrumOpen);
  const selectedTrackId = useStore(state => state.selectedTrackId);
  const tracks = useStore(state => state.tracks);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  const selectedTrack = tracks.find(t => t.id === selectedTrackId);

  useEffect(() => {
    if (!isSpectrumOpen || !canvasRef.current) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = selectedTrackId ? getTrackAnalyser(selectedTrackId) : getMasterAnalyser();
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const barAreaHeight = height - LABEL_HEIGHT;

      animationRef.current = requestAnimationFrame(render);

      analyser.getByteFrequencyData(dataArray);

      // Background
      ctx.fillStyle = 'rgba(13, 17, 23, 0.35)';
      ctx.fillRect(0, 0, width, height);

      // Horizontal grid lines (bar area only)
      ctx.strokeStyle = 'rgba(45, 51, 59, 0.15)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const y = (barAreaHeight / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Separator above labels
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, barAreaHeight);
      ctx.lineTo(width, barAreaHeight);
      ctx.stroke();

      // Frequency bars
      const activeBins = Math.floor(bufferLength * ACTIVE_BIN_RATIO);
      const barWidth = width / activeBins;

      const gradient = ctx.createLinearGradient(0, barAreaHeight, 0, 0);
      gradient.addColorStop(0, '#A742FF');
      gradient.addColorStop(0.5, '#00E5FF');
      gradient.addColorStop(1, '#F27D26');

      ctx.fillStyle = gradient;

      for (let i = 0; i < activeBins; i++) {
        const value = dataArray[i];
        const percent = value / 255;
        const barHeight = Math.max(2, percent * (barAreaHeight - 10));
        const x = i * barWidth;
        const y = barAreaHeight - barHeight;

        ctx.beginPath();
        ctx.roundRect(x + 1, y, Math.max(1.5, barWidth - 1.5), barHeight, [2, 2, 0, 0]);
        ctx.fill();
      }

      // Frequency labels
      const sampleRate = getSharedAudioContext().sampleRate;
      const nyquist = sampleRate / 2;

      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      for (const freq of FREQ_LABELS) {
        if (freq > nyquist) continue;
        // x position derived from bin index mapped across activeBins
        const x = (freq / (nyquist * ACTIVE_BIN_RATIO)) * width;
        if (x > width) continue;

        // Tick mark
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, barAreaHeight + 1);
        ctx.lineTo(x, barAreaHeight + 5);
        ctx.stroke();

        // Label
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        const label = freq >= 1000 ? `${freq / 1000}k` : String(freq);
        ctx.fillText(label, x, height - 1);
      }
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isSpectrumOpen, selectedTrackId]);

  if (!isSpectrumOpen) return null;

  return (
    <div className="absolute bottom-2 right-[444px] z-[110] w-[420px] h-56 rounded border border-[var(--color-border-main)] bg-[var(--color-bg-sidebar)] shadow-2xl flex flex-col overflow-hidden">
      <div className="h-7 px-2 border-b border-[var(--color-border-main)] bg-black/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
            Audio Spectrum
          </span>
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[var(--color-accent-purple)]/20 border border-[var(--color-accent-purple)]/40 text-[var(--color-accent)] uppercase tracking-wider truncate max-w-[200px]">
            {selectedTrack ? selectedTrack.name : 'Master'}
          </span>
        </div>
        <button
          onClick={() => setSpectrumOpen(false)}
          className="text-[10px] px-1.5 py-0.5 rounded text-[var(--color-text-muted)] hover:text-white hover:bg-white/10 transition-colors"
          title="Close spectrum"
        >
          Close
        </button>
      </div>

      <div className="flex-1 relative bg-[var(--color-bg-deep)]/30">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          aria-label={selectedTrack ? `Spectrum for ${selectedTrack.name}` : 'Master output spectrum'}
        />
      </div>
    </div>
  );
};
