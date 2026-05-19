import React, { useEffect, useRef } from 'react';

interface WaveformRendererProps {
  buffer: AudioBuffer | null;
  startTime?: number; // In seconds relative to buffer
  duration?: number; // In seconds to render
  width: number;
  height: number;
  color?: string;
}

export const WaveformRenderer = React.memo<WaveformRendererProps>(({ 
  buffer, 
  startTime = 0,
  duration,
  width, 
  height, 
  color = '#3b82f6' 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderRequestId = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !buffer) return;

    // Find the scrollable viewport (the one with ref viewportRef in App.tsx)
    const viewport = document.getElementById('jackdaw-viewport') || container.closest('.overflow-x-auto');
    if (!viewport) return;

    const render = () => {
      if (renderRequestId.current) cancelAnimationFrame(renderRequestId.current);
      
      renderRequestId.current = requestAnimationFrame(() => {
        renderRequestId.current = null;
        
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !buffer) return;

        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        const viewportRect = viewport.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // Calculate intersection of container and viewport with a 200px buffer for safety
        const bufferPx = 200;
        const visibleLeftRaw = Math.floor(viewportRect.left - containerRect.left);
        const visibleRightRaw = Math.ceil(viewportRect.right - containerRect.left);
        
        // Clamp to clip boundaries but add buffer
        const visibleLeft = Math.max(0, visibleLeftRaw - bufferPx);
        const visibleRight = Math.min(width, visibleRightRaw + bufferPx);
        const visibleWidth = Math.max(0, visibleRight - visibleLeft);

        if (visibleWidth <= 0 || isNaN(visibleWidth)) {
          canvas.width = 0;
          return;
        }

        // Update canvas size with DPR support
        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.ceil(visibleWidth * dpr);
        const targetH = Math.ceil(height * dpr);

        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
          canvas.style.width = `${visibleWidth}px`;
          canvas.style.height = `${height}px`;
        }
        
        // Position the canvas sliding window within the clip
        canvas.style.transform = `translateX(${visibleLeft}px)`;

        const data = buffer.getChannelData(0);
        if (!data || data.length === 0) return;
        
        const totalDuration = buffer.duration;
        const clipDuration = duration || totalDuration;
        
        if (width <= 0 || !totalDuration) return;

        // Reset transform and apply DPR scaling
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Map visible window to sample range
        // pixelsPerSecond is accurately calculated based on clip width / clip duration
        const pixelsPerSecond = width / clipDuration;
        const samplesPerSecond = data.length / totalDuration;
        
        // The time at the start of the visible canvas segment
        const startVisibleTime = visibleLeft / pixelsPerSecond;
        const sampleOffset = Math.floor((startTime + startVisibleTime) * samplesPerSecond);
        
        // Increment per pixel
        const step = Math.max(1, Math.floor(samplesPerSecond / pixelsPerSecond));
        const amp = height / 2;

        // Resolve CSS color variables if needed
        let strokeColor = color;
        if (color.startsWith('var(')) {
          const propertyName = color.slice(4, -1).trim();
          // Try root then fallback
          strokeColor = getComputedStyle(document.documentElement).getPropertyValue(propertyName).trim() || 
                        getComputedStyle(document.body).getPropertyValue(propertyName).trim() || 
                        '#00E5FF';
        }

        ctx.clearRect(0, 0, visibleWidth, height);
        ctx.beginPath();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;

        for (let i = 0; i < visibleWidth; i++) {
           let min = 1.0;
           let max = -1.0;
           
           // Sample index for this pixel
           const sampleIndex = sampleOffset + Math.floor(i * (samplesPerSecond / pixelsPerSecond));
           if (sampleIndex >= data.length) break;
           if (sampleIndex < 0) continue;

           const stepEnd = Math.min(sampleIndex + step, data.length);
           for (let j = sampleIndex; j < stepEnd; j++) {
             const datum = data[j];
             if (datum < min) min = datum;
             if (datum > max) max = datum;
           }
           
           if (min > max) { min = 0; max = 0; }
           
           const y1 = (1 + min) * amp;
           const y2 = (1 + max) * amp;
           ctx.moveTo(i, y1);
           ctx.lineTo(i, y2);
        }
        ctx.stroke();
      });
    };

    // Initial render
    render();

    // Listen to scroll to re-render visible slice
    viewport.addEventListener('scroll', render, { passive: true });
    window.addEventListener('resize', render);

    return () => {
      viewport.removeEventListener('scroll', render);
      window.removeEventListener('resize', render);
      if (renderRequestId.current) cancelAnimationFrame(renderRequestId.current);
    };
  }, [buffer, width, height, color, startTime, duration]);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <canvas 
        ref={canvasRef} 
        style={{ position: 'absolute', top: 0, left: 0 }}
        className="pointer-events-none"
      />
    </div>
  );
});
