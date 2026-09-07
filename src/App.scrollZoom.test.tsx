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
        const delta = -e.deltaY;
        const zoomFactor = delta > 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR;
        setZoomSpy(currentZoom * zoomFactor);
      } else if (e.shiftKey) {
        e.preventDefault();
        vp.scrollLeft += e.deltaY;
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

  it('allows native vertical scrolling when scrolling on the viewport', () => {
    const event = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    viewport.dispatchEvent(event);
    expect(setZoomSpy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('zooms in when ctrl+scrolling up on the viewport', () => {
    const event = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
    viewport.dispatchEvent(event);
    expect(setZoomSpy).toHaveBeenCalledOnce();
    expect(setZoomSpy).toHaveBeenCalledWith(100 * ZOOM_IN_FACTOR);
    expect(event.defaultPrevented).toBe(true);
  });

  it('zooms out when ctrl+scrolling down on the viewport', () => {
    const event = new WheelEvent('wheel', { deltaY: 100, ctrlKey: true, bubbles: true, cancelable: true });
    viewport.dispatchEvent(event);
    expect(setZoomSpy).toHaveBeenCalledOnce();
    expect(setZoomSpy).toHaveBeenCalledWith(100 * ZOOM_OUT_FACTOR);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not zoom when scrolling on an element outside the viewport', () => {
    const event = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    outside.dispatchEvent(event);
    expect(setZoomSpy).not.toHaveBeenCalled();
  });

  it('scrolls horizontally when shift+scrolling on the viewport', () => {
    const event = new WheelEvent('wheel', { deltaY: 100, shiftKey: true, bubbles: true, cancelable: true });
    viewport.dispatchEvent(event);
    expect(setZoomSpy).not.toHaveBeenCalled();
    expect(viewport.scrollLeft).toBe(100);
    expect(event.defaultPrevented).toBe(true);
  });

  it('handles ctrl+scroll zoom for events from child elements of the viewport', () => {
    const child = document.createElement('div');
    viewport.appendChild(child);
    const event = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
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
      if (!e.ctrlKey && !(e as any).metaKey) return;
      e.preventDefault();
      const delta = -e.deltaY;
      const zoomFactor = delta > 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR;
      setZoomSpy(currentZoom * zoomFactor);
    };

    document.addEventListener('wheel', handleWheel, { passive: false });

    // Viewport mounts later
    document.body.appendChild(lateViewport);
    lateRef.current = lateViewport;

    const event = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
    lateViewport.dispatchEvent(event);
    expect(setZoomSpy).toHaveBeenCalledOnce();

    document.removeEventListener('wheel', handleWheel);
    document.body.removeChild(lateViewport);

    // Re-add original cleanup
    cleanup = () => {};
  });
});
