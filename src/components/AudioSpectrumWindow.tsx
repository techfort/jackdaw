import React, { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { getTrackAnalyser } from '../lib/sharedAudioContext';

export const AudioSpectrumWindow: React.FC = () => {
  const isSpectrumOpen = useStore(state => state.isSpectrumOpen);
  const setSpectrumOpen = useStore(state => state.setSpectrumOpen);
  const selectedTrackId = useStore(state => state.selectedTrackId);
  const tracks = useStore(state => state.tracks);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  const selectedTrack = tracks.find(t => t.id === selectedTrackId);

  useEffect(() => {
    if (!isSpectrumOpen || !selectedTrackId || !canvasRef.current) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = getTrackAnalyser(selectedTrackId);
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Setup high-DPI scaling
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

      // Request next frame immediately to keep loop running
      animationRef.current = requestAnimationFrame(render);

      // Get FFT frequency data
      analyser.getByteFrequencyData(dataArray);

      // Draw background
      ctx.fillStyle = 'rgba(13, 17, 23, 0.35)'; // Semitransparent for visual trails
      ctx.fillRect(0, 0, width, height);

      // Draw subtle grid lines
      ctx.strokeStyle = 'rgba(45, 51, 59, 0.15)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const y = (height / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw frequency bars
      // We limit to the active bins to focus on human-audible frequency ranges (exclude high bin roll-offs)
      const activeBins = Math.floor(bufferLength * 0.85); 
      const barWidth = (width / activeBins);
      
      // Gradient matching the premium look (A742FF -> 00E5FF -> F27D26)
      const gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, '#A742FF'); // Neon purple at bottom
      gradient.addColorStop(0.5, '#00E5FF'); // Cyan in middle
      gradient.addColorStop(1, '#F27D26'); // Orange accent at top

      ctx.fillStyle = gradient;

      for (let i = 0; i < activeBins; i++) {
        // Value range is 0 to 255
        const value = dataArray[i];
        // Scale height to canvas dimensions
        const percent = value / 255;
        const barHeight = Math.max(2, percent * (height - 10));

        const x = i * barWidth;
        const y = height - barHeight;

        // Draw rounded top bar
        ctx.beginPath();
        ctx.roundRect(x + 1, y, Math.max(1.5, barWidth - 1.5), barHeight, [2, 2, 0, 0]);
        ctx.fill();
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
      {/* Header */}
      <div className="h-7 px-2 border-b border-[var(--color-border-main)] bg-black/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
            Audio Spectrum
          </span>
          {selectedTrack && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-[var(--color-accent-purple)]/20 border border-[var(--color-accent-purple)]/40 text-[var(--color-accent)] uppercase tracking-wider truncate max-w-[200px]">
              {selectedTrack.name}
            </span>
          )}
        </div>
        <button
          onClick={() => setSpectrumOpen(false)}
          className="text-[10px] px-1.5 py-0.5 rounded text-[var(--color-text-muted)] hover:text-white hover:bg-white/10 transition-colors"
          title="Close spectrum"
        >
          Close
        </button>
      </div>

      {/* Visualizer Area */}
      <div className="flex-1 relative bg-[var(--color-bg-deep)]/30 flex items-center justify-center">
        {selectedTrackId ? (
          <canvas
            ref={canvasRef}
            className="w-full h-full block"
            aria-label={`Spectrum visualizer for ${selectedTrack?.name || 'selected track'}`}
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <span className="text-2xl mb-2 select-none opacity-50">📊</span>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-dark)] max-w-xs leading-relaxed">
              Select a track to view spectrum
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
