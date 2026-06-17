import { describe, it, expect } from 'vitest';
import { getBpmAt, getTempoSegments, snapToNearestBeat } from './tempoUtils';
import type { TempoEvent } from '../types';

// ---------------------------------------------------------------------------
// getBpmAt
// ---------------------------------------------------------------------------
describe('getBpmAt', () => {
  it('returns globalBpm when no events are provided', () => {
    expect(getBpmAt(0, [], 120)).toBe(120);
    expect(getBpmAt(100, [], 90)).toBe(90);
  });

  it('returns globalBpm when time is before all events', () => {
    const events: TempoEvent[] = [{ id: '1', time: 10, bpm: 140 }];
    expect(getBpmAt(5, events, 120)).toBe(120);
  });

  it('returns the correct BPM at the exact event time', () => {
    const events: TempoEvent[] = [{ id: '1', time: 10, bpm: 140 }];
    expect(getBpmAt(10, events, 120)).toBe(140);
  });

  it('returns the correct BPM between two events', () => {
    const events: TempoEvent[] = [
      { id: '1', time: 5, bpm: 100 },
      { id: '2', time: 20, bpm: 160 },
    ];
    expect(getBpmAt(12, events, 120)).toBe(100);
  });

  it('returns the BPM of the last event after all events have passed', () => {
    const events: TempoEvent[] = [
      { id: '1', time: 5, bpm: 100 },
      { id: '2', time: 20, bpm: 160 },
    ];
    expect(getBpmAt(50, events, 120)).toBe(160);
  });

  it('handles unsorted events correctly', () => {
    const events: TempoEvent[] = [
      { id: '2', time: 20, bpm: 160 },
      { id: '1', time: 5, bpm: 100 },
    ];
    expect(getBpmAt(10, events, 120)).toBe(100);
    expect(getBpmAt(25, events, 120)).toBe(160);
  });

  it('handles multiple events at boundary times', () => {
    const events: TempoEvent[] = [
      { id: '1', time: 0, bpm: 80 },
      { id: '2', time: 10, bpm: 120 },
    ];
    expect(getBpmAt(0, events, 60)).toBe(80);
    expect(getBpmAt(10, events, 60)).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// getTempoSegments
// ---------------------------------------------------------------------------
describe('getTempoSegments', () => {
  it('returns a single segment spanning 0 to endTime when no events are provided', () => {
    const segments = getTempoSegments([], 120, 60);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({
      startTime: 0,
      endTime: 60,
      bpm: 120,
      numerator: 4,
      denominator: 4,
    });
  });

  it('returns correct segments for a single tempo event at time > 0', () => {
    const events: TempoEvent[] = [{ id: '1', time: 10, bpm: 140 }];
    const segments = getTempoSegments(events, 120, 30);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({
      startTime: 0,
      endTime: 10,
      bpm: 120,
      numerator: 4,
      denominator: 4,
    });
    expect(segments[1]).toEqual({
      startTime: 10,
      endTime: 30,
      bpm: 140,
      numerator: 4,
      denominator: 4,
    });
  });

  it('returns a single segment when the only event starts at time 0', () => {
    const events: TempoEvent[] = [{ id: '1', time: 0, bpm: 90 }];
    const segments = getTempoSegments(events, 120, 20);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({
      startTime: 0,
      endTime: 20,
      bpm: 90,
      numerator: 4,
      denominator: 4,
    });
  });

  it('builds multiple segments with correct boundaries', () => {
    const events: TempoEvent[] = [
      { id: '1', time: 5, bpm: 100 },
      { id: '2', time: 15, bpm: 180 },
    ];
    const segments = getTempoSegments(events, 120, 40);
    expect(segments).toHaveLength(3);
    expect(segments[0].startTime).toBe(0);
    expect(segments[0].endTime).toBe(5);
    expect(segments[0].bpm).toBe(120);
    expect(segments[1].startTime).toBe(5);
    expect(segments[1].endTime).toBe(15);
    expect(segments[1].bpm).toBe(100);
    expect(segments[2].startTime).toBe(15);
    expect(segments[2].endTime).toBe(40);
    expect(segments[2].bpm).toBe(180);
  });

  it('applies explicit numerator and denominator from events', () => {
    const events: TempoEvent[] = [
      { id: '1', time: 0, bpm: 120, numerator: 3, denominator: 8 },
    ];
    const segments = getTempoSegments(events, 120, 20);
    expect(segments[0].numerator).toBe(3);
    expect(segments[0].denominator).toBe(8);
  });

  it('inherits numerator and denominator from the previous segment when not specified', () => {
    const events: TempoEvent[] = [
      { id: '1', time: 0, bpm: 120, numerator: 3, denominator: 8 },
      { id: '2', time: 10, bpm: 160 },
    ];
    const segments = getTempoSegments(events, 120, 30);
    expect(segments).toHaveLength(2);
    // Second event inherits time signature from the first
    expect(segments[1].numerator).toBe(3);
    expect(segments[1].denominator).toBe(8);
  });

  it('handles unsorted input events', () => {
    const events: TempoEvent[] = [
      { id: '2', time: 20, bpm: 160 },
      { id: '1', time: 5, bpm: 100 },
    ];
    const segments = getTempoSegments(events, 120, 40);
    expect(segments[0].startTime).toBe(0);
    expect(segments[0].endTime).toBe(5);
    expect(segments[1].startTime).toBe(5);
    expect(segments[1].endTime).toBe(20);
    expect(segments[2].startTime).toBe(20);
    expect(segments[2].endTime).toBe(40);
  });

  it('last segment always ends at endTime', () => {
    const events: TempoEvent[] = [{ id: '1', time: 5, bpm: 100 }];
    const segments = getTempoSegments(events, 120, 999);
    expect(segments[segments.length - 1].endTime).toBe(999);
  });
});

// ---------------------------------------------------------------------------
// snapToNearestBeat
// ---------------------------------------------------------------------------
describe('snapToNearestBeat', () => {
  it('snaps to beat 0 (time 0) when time is before the first beat', () => {
    // 120 bpm => beat every 0.5s; time 0.1 is closer to beat 0 than beat 1
    const result = snapToNearestBeat(0.1, [], 120);
    expect(result).toBeCloseTo(0, 5);
  });

  it('snaps to the nearest beat correctly within a constant-tempo segment', () => {
    // 120 bpm => beat every 0.5s
    // time = 0.74s — closer to beat 1 (0.5s) than beat 2 (1.0s)? 0.74-0.5=0.24, 1.0-0.74=0.26 => rounds to beat 1 = 0.5s
    // Actually Math.round(0.74/0.5) = Math.round(1.48) = 1 => 1 * 0.5 = 0.5
    expect(snapToNearestBeat(0.74, [], 120)).toBeCloseTo(0.5, 5);

    // time = 0.76s — closer to beat 2 (1.0s): Math.round(0.76/0.5) = Math.round(1.52) = 2 => 2 * 0.5 = 1.0
    expect(snapToNearestBeat(0.76, [], 120)).toBeCloseTo(1.0, 5);
  });

  it('snaps to the exact beat when time is already on a beat boundary', () => {
    // 120 bpm => beat every 0.5s
    expect(snapToNearestBeat(0.5, [], 120)).toBeCloseTo(0.5, 5);
    expect(snapToNearestBeat(1.0, [], 120)).toBeCloseTo(1.0, 5);
    expect(snapToNearestBeat(0, [], 120)).toBeCloseTo(0, 5);
  });

  it('snaps correctly within a later tempo segment', () => {
    // Segment 1: 0–10s at 120bpm (beat every 0.5s)
    // Segment 2: 10s+ at 60bpm (beat every 1.0s)
    const events: TempoEvent[] = [{ id: '1', time: 10, bpm: 60 }];

    // time = 10.4s: within segment 2, offset = 0.4, beatDuration = 1.0
    // Math.round(0.4 / 1.0) = 0 => snap to 10 + 0*1.0 = 10.0
    expect(snapToNearestBeat(10.4, events, 120)).toBeCloseTo(10.0, 5);

    // time = 10.6s: Math.round(0.6 / 1.0) = 1 => snap to 10 + 1*1.0 = 11.0
    expect(snapToNearestBeat(10.6, events, 120)).toBeCloseTo(11.0, 5);
  });

  it('treats the segment boundary itself as beat 0 of the new segment', () => {
    const events: TempoEvent[] = [{ id: '1', time: 8, bpm: 60 }];
    // time = 8.0 exactly: offset = 0, beatIndex = 0, result = 8.0
    expect(snapToNearestBeat(8.0, events, 120)).toBeCloseTo(8.0, 5);
  });

  it('handles time = 0 with no events', () => {
    expect(snapToNearestBeat(0, [], 120)).toBeCloseTo(0, 5);
  });
});
