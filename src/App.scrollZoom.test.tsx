import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Isolate the wheel handler logic: attach to document with viewport containment check.
// This pattern must stay stable — it has broken multiple times when the listener was
// scoped to viewportRef.current (which is null if the viewport hasn't mounted yet).

describe('scroll zoom — wheel event handler', () => {
  let viewport: HTMLDivElement;
  let outside: HTMLDivElement;
  let setZoomSpy: ReturnType<typeof vi.fn>;
  let currentZoom: number;
  let cleanup: () => void;

  const ZOOM_IN_FACTOR = 1.1;
  const ZOOM_OUT_FACTOR = 0.9;

  beforeEach(() => {
    currentZoom = 100;
    setZoomSpy = vi.fn((z: number) => {
      currentZoom = Math.max(0.5, Math.min(500, z));
    });

    viewport = document.createElement('div');
    viewport.id = 'jackdaw-viewport';
    document.body.appendChild(viewport);

    outside = document.createElement('div');
    outside.id = 'outside';
    document.body.appendChild(outside);

    // Reproduce the handler exactly as implemented in App.tsx
    const viewportRef = { current: viewport };
    const handleWheel = (e: WheelEvent) => {
      const vp = viewportRef.current;
      if (!vp || !vp.contains(e.target as Node)) return;

      if (e.ctrlKey || (e as any).metaKey) {
        e.preventDefault();
        vp.scrollLeft += e.deltaY;
      } else {
        e.preventDefault();
        const delta = -e.deltaY;
        const zoomFactor = delta > 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR;
        setZoomSpy(currentZoom * zoomFactor);
      }
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
    cleanup = () => document.removeEventListener('wheel', handleWheel);
  });

  afterEach(() => {
    cleanup();
    document.body.removeChild(viewport);
    document.body.removeChild(outside);
  });

  it('zooms in when scrolling up on the viewport', () => {
    const event = new WheelEvent('wheel', { deltaY: -100, bubbles: true });
    viewport.dispatchEvent(event);
    expect(setZoomSpy).toHaveBeenCalledOnce();
    expect(setZoomSpy).toHaveBeenCalledWith(100 * ZOOM_IN_FACTOR);
  });

  it('zooms out when scrolling down on the viewport', () => {
    const event = new WheelEvent('wheel', { deltaY: 100, bubbles: true });
    viewport.dispatchEvent(event);
    expect(setZoomSpy).toHaveBeenCalledOnce();
    expect(setZoomSpy).toHaveBeenCalledWith(100 * ZOOM_OUT_FACTOR);
  });

  it('does not zoom when scrolling on an element outside the viewport', () => {
    const event = new WheelEvent('wheel', { deltaY: -100, bubbles: true });
    outside.dispatchEvent(event);
    expect(setZoomSpy).not.toHaveBeenCalled();
  });

  it('does not zoom when ctrl+scroll on the viewport (horizontal scroll mode)', () => {
    const event = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true });
    viewport.dispatchEvent(event);
    expect(setZoomSpy).not.toHaveBeenCalled();
  });

  it('handles zoom for events from child elements of the viewport', () => {
    const child = document.createElement('div');
    viewport.appendChild(child);
    const event = new WheelEvent('wheel', { deltaY: -100, bubbles: true });
    child.dispatchEvent(event);
    expect(setZoomSpy).toHaveBeenCalledOnce();
    viewport.removeChild(child);
  });

  it('works even when viewport is not in DOM at listener setup time', () => {
    // Simulates the bug: listener on document, viewport was null at setup time,
    // then viewport mounts later. The handler must use a live ref check.
    cleanup();

    const lateViewport = document.createElement('div');
    lateViewport.id = 'late-viewport';
    // viewport NOT in DOM yet

    const lateRef = { current: null as HTMLDivElement | null };

    const handleWheel = (e: WheelEvent) => {
      const vp = lateRef.current;
      if (!vp || !vp.contains(e.target as Node)) return;
      const delta = -e.deltaY;
      const zoomFactor = delta > 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR;
      setZoomSpy(currentZoom * zoomFactor);
    };

    document.addEventListener('wheel', handleWheel, { passive: false });

    // Viewport mounts later
    document.body.appendChild(lateViewport);
    lateRef.current = lateViewport;

    const event = new WheelEvent('wheel', { deltaY: -100, bubbles: true });
    lateViewport.dispatchEvent(event);
    expect(setZoomSpy).toHaveBeenCalledOnce();

    document.removeEventListener('wheel', handleWheel);
    document.body.removeChild(lateViewport);

    // Re-add original cleanup
    cleanup = () => {};
  });
});
