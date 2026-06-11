import { describe, expect, it } from 'vitest';
import { parseClockToken, parseAbsolutePositionToken, parseRelativeToken } from './positionParser';

describe('parseClockToken', () => {
  it('parses mm:ss format', () => {
    expect(parseClockToken('1:30')).toBe(90);
    expect(parseClockToken('0:05')).toBe(5);
  });

  it('parses hh:mm:ss format', () => {
    expect(parseClockToken('1:02:03')).toBe(3723);
  });

  it('returns null for single component', () => {
    expect(parseClockToken('30')).toBeNull();
  });

  it('returns null for four or more components', () => {
    expect(parseClockToken('1:2:3:4')).toBeNull();
  });

  it('returns null for negative values', () => {
    expect(parseClockToken('-1:30')).toBeNull();
    expect(parseClockToken('1:-5')).toBeNull();
  });

  it('returns null for non-numeric parts', () => {
    expect(parseClockToken('a:30')).toBeNull();
    expect(parseClockToken('1:b')).toBeNull();
  });
});

describe('parseAbsolutePositionToken', () => {
  const tempo = 120; // 0.5s per beat

  it('parses plain seconds (no decimal point)', () => {
    // Values with a '.' are treated as bar.beat notation; plain seconds must be integer or use clock format
    expect(parseAbsolutePositionToken('32', tempo)).toBe(32);
    expect(parseAbsolutePositionToken('0', tempo)).toBe(0);
  });

  it('parses clock format via delegation', () => {
    expect(parseAbsolutePositionToken('1:30', tempo)).toBe(90);
  });

  it('parses bar.beat format', () => {
    // bar 1, beat 1 = 0 total beats → 0s
    expect(parseAbsolutePositionToken('1.1', tempo)).toBeCloseTo(0);
    // bar 1, beat 2 = 1 total beat → 0.5s at 120 bpm
    expect(parseAbsolutePositionToken('1.2', tempo)).toBeCloseTo(0.5);
    // bar 2, beat 1 = 4 total beats → 2s at 120 bpm
    expect(parseAbsolutePositionToken('2.1', tempo)).toBeCloseTo(2);
  });

  it('rejects bar < 1', () => {
    expect(parseAbsolutePositionToken('0.1', tempo)).toBeNull();
  });

  it('rejects beat < 1', () => {
    expect(parseAbsolutePositionToken('1.0', tempo)).toBeNull();
  });

  it('returns null for negative seconds', () => {
    expect(parseAbsolutePositionToken('-1', tempo)).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(parseAbsolutePositionToken('abc', tempo)).toBeNull();
  });
});

describe('parseRelativeToken', () => {
  const tempo = 120;

  it('parses plain seconds', () => {
    expect(parseRelativeToken('5', tempo)).toBe(5);
    expect(parseRelativeToken('0', tempo)).toBe(0);
  });

  it('parses clock format via delegation', () => {
    expect(parseRelativeToken('0:30', tempo)).toBe(30);
  });

  it('parses bars.beats format', () => {
    // 1 bar = 4 beats → 2s at 120 bpm
    expect(parseRelativeToken('1.0', tempo)).toBeCloseTo(2);
    // 0 bars, 2 beats → 1s
    expect(parseRelativeToken('0.2', tempo)).toBeCloseTo(1);
  });

  it('returns null for negative values', () => {
    expect(parseRelativeToken('-5', tempo)).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(parseRelativeToken('xyz', tempo)).toBeNull();
  });
});
