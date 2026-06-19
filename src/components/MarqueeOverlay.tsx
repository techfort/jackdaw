import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';

interface MarqueeOverlayProps {
  /** The `position: relative` container that wraps all track rows. */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Rubber-band selection. Dragging across empty timeline space draws a rectangle;
 * every clip element ([data-clip-id]) that intersects it (even partially) is added
 * to the store's selectedClipIds. The selection is then movable/deletable as a
 * group (see TrackItem clip drag + deleteSelectedClips).
 *
 * Hit-testing is done against live getBoundingClientRect of clip elements so it is
 * robust to the nested/sticky timeline layout and current zoom/scroll.
 */
export const MarqueeOverlay: React.FC<MarqueeOverlayProps> = ({ containerRef }) => {
  const setSelectedClipIds = useStore(state => state.setSelectedClipIds);
  const [rect, setRect] = useState<Rect | null>(null);
  // keep latest setter in a ref so the listener effect can run once
  const setIdsRef = useRef(setSelectedClipIds);
  setIdsRef.current = setSelectedClipIds;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0 || e.shiftKey) return;
      const target = e.target as HTMLElement;
      // Let clips, sidebar controls and interactive elements handle their own clicks.
      if (target.closest('[data-clip-id]')) return;
      if (target.closest('.track-controls')) return;
      if (target.closest('button, a, input, textarea')) return;

      const cRect = container.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      let moved = false;

      const hitTest = (left: number, top: number, right: number, bottom: number) => {
        const ids: string[] = [];
        container.querySelectorAll('[data-clip-id]').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) {
            const id = (el as HTMLElement).dataset.clipId;
            if (id) ids.push(id);
          }
        });
        setIdsRef.current(ids);
      };

      const onMove = (me: MouseEvent) => {
        const dx = me.clientX - startX;
        const dy = me.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < 4) return; // ignore tiny jitters / plain clicks
        moved = true;
        const left = Math.min(startX, me.clientX);
        const top = Math.min(startY, me.clientY);
        const w = Math.abs(dx);
        const h = Math.abs(dy);
        setRect({ x: left - cRect.left, y: top - cRect.top, w, h });
        hitTest(left, top, left + w, top + h);
      };

      const onUp = () => {
        if (!moved) setIdsRef.current([]); // plain click on empty space clears selection
        setRect(null);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

    container.addEventListener('mousedown', onDown);
    return () => container.removeEventListener('mousedown', onDown);
  }, [containerRef]);

  if (!rect) return null;

  return (
    <div
      className="absolute z-30 pointer-events-none rounded-sm border border-[var(--color-accent)] bg-[var(--color-accent)]/10"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    />
  );
};
