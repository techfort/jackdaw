/**
 * Terminal alias engine for the .jackdawrc text-first config.
 *
 * The rc text is the single source of truth. Each alias line has the form:
 *   alias <name> = <body>
 * where <name> is a single token (the command word the user types) and <body>
 * is a command string (may itself contain arguments, e.g. `arm sel`).
 *
 * Expansion rule: if the first whitespace token of the input matches an alias
 * name, it is replaced by the alias body and the remaining args are appended.
 * Resolution iterates so an alias may reference another, bounded by a depth cap
 * and a visited-set to prevent cycles.
 */

const MAX_EXPANSION_DEPTH = 10;
const ALIAS_LINE = /^\s*alias\s+(\S+)\s*=\s*(.+?)\s*$/i;

/** Parse rc text into a name→body map. Blank lines and `#` comments are ignored. */
export const parseRc = (text: string): Record<string, string> => {
  const aliases: Record<string, string> = {};
  for (const rawLine of (text || '').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(ALIAS_LINE);
    if (!match) continue;
    const [, name, body] = match;
    aliases[name] = body.trim();
  }
  return aliases;
};

/**
 * Expand the first token of `input` against the alias map, repeating until no
 * alias matches (or the depth/cycle guard trips). Returns the expanded command.
 */
export const expandAliases = (input: string, aliases: Record<string, string>): string => {
  let current = (input || '').trim();
  const seen = new Set<string>();

  for (let depth = 0; depth < MAX_EXPANSION_DEPTH; depth++) {
    const spaceIdx = current.search(/\s/);
    const head = spaceIdx === -1 ? current : current.slice(0, spaceIdx);
    const rest = spaceIdx === -1 ? '' : current.slice(spaceIdx); // keeps leading space

    const body = aliases[head];
    if (body === undefined) break;     // no alias for this head — done
    if (seen.has(head)) break;         // cycle — stop, leave as-is
    seen.add(head);

    current = `${body}${rest}`.trim();
  }

  return current;
};

/**
 * Upsert an `alias <name> = <body>` line in rc text, preserving comments and
 * other lines. Replaces an existing definition in place, else appends.
 */
export const setRcAlias = (text: string, name: string, body: string): string => {
  const lines = (text || '').split('\n');
  const newLine = `alias ${name} = ${body}`;
  let replaced = false;

  const out = lines.map(line => {
    const match = line.match(ALIAS_LINE);
    if (match && match[1] === name) {
      replaced = true;
      return newLine;
    }
    return line;
  });

  if (!replaced) {
    // Drop a trailing blank line if present, append, keep it tidy.
    while (out.length && out[out.length - 1].trim() === '') out.pop();
    out.push(newLine);
  }
  return out.join('\n');
};

/** Remove the `alias <name> = ...` line(s) from rc text. */
export const removeRcAlias = (text: string, name: string): string => {
  return (text || '')
    .split('\n')
    .filter(line => {
      const match = line.match(ALIAS_LINE);
      return !(match && match[1] === name);
    })
    .join('\n');
};
