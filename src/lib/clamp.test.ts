import { describe, expect, it } from 'vitest';
import { clamp } from './clamp';

describe('clamp', () => {
  it('returns value unchanged when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('clamps to min when value is below range', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(-0.1, 0, 1)).toBe(0);
  });

  it('clamps to max when value is above range', () => {
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(1.1, 0, 1)).toBe(1);
  });

  it('returns min when value equals min', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it('returns max when value equals max', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('handles negative ranges', () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(0, -10, -1)).toBe(-1);
    expect(clamp(-20, -10, -1)).toBe(-10);
  });
});
