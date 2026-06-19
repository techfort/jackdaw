import { useEffect, useRef } from 'react';

/**
 * Drives a level meter from an AnalyserNode. Each animation frame it reads the
 * time-domain peak, applies fast-attack / slow-decay smoothing, and hands the
 * smoothed 0..1 level to `apply` — which should update the DOM imperatively so
 * there is no per-frame React render.
 *
 * `getAnalyser` is read every frame (not captured once) so it transparently
 * picks up a recreated analyser/context. Pass a stable reference (a module
 * function, or a useCallback) to avoid restarting the loop each render.
 */
export function useMeter(
  getAnalyser: () => AnalyserNode | null,
  apply: (level: number) => void,
): void {
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    let raf = 0;
    let level = 0;
    let data: Float32Array | null = null;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const analyser = getAnalyser();
      let peak = 0;
      if (analyser) {
        if (!data || data.length !== analyser.fftSize) data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        for (let i = 0; i < data.length; i++) {
          const abs = Math.abs(data[i]);
          if (abs > peak) peak = abs;
        }
      }
      level = peak > level ? peak : Math.max(0, level - 0.02);
      applyRef.current(level);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getAnalyser]);
}

/** Shared meter colour ramp: accent → amber → red near clipping. */
export const meterColor = (level: number): string =>
  level > 0.95 ? '#ef4444' : level > 0.7 ? '#f59e0b' : 'var(--color-accent)';
