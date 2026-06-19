import { describe, it, expect } from 'vitest';

// TEMPORARY: deliberately failing test to verify CI gates the preview deploy on
// passing tests. This whole file is removed once the gate is confirmed.
describe('CI deploy-gate check (temporary)', () => {
  it('fails on purpose so build_and_preview must be skipped', () => {
    expect(1).toBe(2);
  });
});
