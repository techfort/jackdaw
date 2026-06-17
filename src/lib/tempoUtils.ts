import { TempoEvent } from '../types';

export interface TempoSegment {
  startTime: number;
  endTime: number;
  bpm: number;
  numerator: number;
  denominator: number;
}

/**
 * Build an ordered list of tempo segments between tempo events up to endTime.
 * The first segment always starts at 0. The last segment runs to endTime.
 * numerator and denominator default to 4 and are inherited across events when unspecified.
 */
export function getTempoSegments(
  tempoEvents: TempoEvent[],
  globalBpm: number,
  endTime: number
): TempoSegment[] {
  const sorted = [...tempoEvents].sort((a, b) => a.time - b.time);

  if (sorted.length === 0) {
    return [
      {
        startTime: 0,
        endTime,
        bpm: globalBpm,
        numerator: 4,
        denominator: 4,
      },
    ];
  }

  const segments: TempoSegment[] = [];
  let prevNumerator = 4;
  let prevDenominator = 4;

  // Segment from 0 up to the first event (using globalBpm)
  const firstEvent = sorted[0];
  if (firstEvent.time > 0) {
    segments.push({
      startTime: 0,
      endTime: firstEvent.time,
      bpm: globalBpm,
      numerator: prevNumerator,
      denominator: prevDenominator,
    });
  }

  // Segments between consecutive events
  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i];
    const nextEvent = sorted[i + 1];
    const segEnd = nextEvent ? nextEvent.time : endTime;

    const numerator = event.numerator ?? prevNumerator;
    const denominator = event.denominator ?? prevDenominator;
    prevNumerator = numerator;
    prevDenominator = denominator;

    segments.push({
      startTime: event.time,
      endTime: segEnd,
      bpm: event.bpm,
      numerator,
      denominator,
    });
  }

  return segments;
}

/**
 * Return the BPM active at wall-clock `time`.
 * Linear scan — last event with event.time <= time wins.
 * Returns globalBpm when tempoEvents is empty or time is before all events.
 */
export function getBpmAt(
  time: number,
  tempoEvents: TempoEvent[],
  globalBpm: number
): number {
  if (tempoEvents.length === 0) {
    return globalBpm;
  }

  const sorted = [...tempoEvents].sort((a, b) => a.time - b.time);
  let activeBpm = globalBpm;

  for (const event of sorted) {
    if (event.time <= time) {
      activeBpm = event.bpm;
    } else {
      break;
    }
  }

  return activeBpm;
}

/**
 * Return the nearest beat boundary to `time` accounting for variable tempo.
 * Finds the active segment, computes beat position within that segment,
 * rounds to the nearest integer beat, and returns the wall-clock time of that beat.
 */
export function snapToNearestBeat(
  time: number,
  tempoEvents: TempoEvent[],
  globalBpm: number
): number {
  const segments = getTempoSegments(tempoEvents, globalBpm, Math.max(time + 1, 1));

  // Find the active segment for the given time
  let activeSegment = segments[0];
  for (const segment of segments) {
    if (time >= segment.startTime) {
      activeSegment = segment;
    } else {
      break;
    }
  }

  const beatDuration = 60 / activeSegment.bpm;
  const segStart = activeSegment.startTime;
  const offsetInSegment = time - segStart;
  const beatIndex = Math.round(offsetInSegment / beatDuration);

  return segStart + beatIndex * beatDuration;
}
