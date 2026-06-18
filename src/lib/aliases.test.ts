import { describe, expect, it } from 'vitest';
import { parseRc, expandAliases, setRcAlias, removeRcAlias } from './aliases';

describe('parseRc', () => {
  it('parses alias lines into a name→body map', () => {
    const rc = 'alias rec = arm sel\nalias bounce = e';
    expect(parseRc(rc)).toEqual({ rec: 'arm sel', bounce: 'e' });
  });

  it('ignores blank lines and # comments', () => {
    const rc = '# my config\n\nalias z = spectrum\n   # indented comment\n';
    expect(parseRc(rc)).toEqual({ z: 'spectrum' });
  });

  it('trims whitespace around name and body', () => {
    expect(parseRc('alias   here   =   go 0  ')).toEqual({ here: 'go 0' });
  });

  it('returns empty for empty/whitespace input', () => {
    expect(parseRc('')).toEqual({});
    expect(parseRc('   \n  \n')).toEqual({});
  });

  it('last definition wins for duplicate names', () => {
    expect(parseRc('alias a = m 1\nalias a = m 2')).toEqual({ a: 'm 2' });
  });
});

describe('expandAliases', () => {
  const aliases = { rec: 'arm sel', bounce: 'e', mu: 'm' };

  it('expands a matching first token', () => {
    expect(expandAliases('rec', aliases)).toBe('arm sel');
  });

  it('passes trailing args through', () => {
    expect(expandAliases('mu 2', aliases)).toBe('m 2');
  });

  it('leaves non-matching commands untouched', () => {
    expect(expandAliases('go 32', aliases)).toBe('go 32');
  });

  it('resolves alias-of-alias', () => {
    const chain = { a: 'b', b: 'c', c: 'play' };
    expect(expandAliases('a', chain)).toBe('play');
  });

  it('stops on a cycle without looping forever', () => {
    const cyclic = { a: 'b', b: 'a' };
    // Should terminate and return one of the cycle members, not hang.
    expect(typeof expandAliases('a', cyclic)).toBe('string');
  });

  it('handles empty input', () => {
    expect(expandAliases('', aliases)).toBe('');
  });
});

describe('setRcAlias', () => {
  it('appends a new alias', () => {
    expect(setRcAlias('', 'rec', 'arm sel')).toBe('alias rec = arm sel');
  });

  it('replaces an existing alias in place, preserving other lines', () => {
    const rc = '# header\nalias rec = arm sel\nalias z = spectrum';
    const out = setRcAlias(rc, 'rec', 'arm 1');
    expect(out).toBe('# header\nalias rec = arm 1\nalias z = spectrum');
  });

  it('appends after existing content without trailing blank lines', () => {
    const out = setRcAlias('alias a = m 1\n\n', 'b', 'e');
    expect(out).toBe('alias a = m 1\nalias b = e');
  });
});

describe('removeRcAlias', () => {
  it('removes the matching alias line', () => {
    const rc = 'alias rec = arm sel\nalias z = spectrum';
    expect(removeRcAlias(rc, 'rec')).toBe('alias z = spectrum');
  });

  it('leaves text unchanged when the alias is absent', () => {
    const rc = 'alias z = spectrum';
    expect(removeRcAlias(rc, 'nope')).toBe('alias z = spectrum');
  });
});
