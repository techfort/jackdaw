export type TextSegment = { type: 'text' | 'mention' | 'tag'; value: string };

export function parseSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const regex = /(@\w+|#\w+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: match[0].startsWith('@') ? 'mention' : 'tag', value: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}

export function parseMentions(text: string): string[] {
  return [...new Set((text.match(/@(\w+)/g) || []).map(m => m.slice(1).toLowerCase()))];
}

export function parseTags(text: string): string[] {
  return [...new Set((text.match(/#(\w+)/g) || []).map(t => t.slice(1).toLowerCase()))];
}

// Returns the @mention or #tag token being typed at the cursor, or null
export function getAutocompleteQuery(
  text: string,
  cursorPos: number
): { type: 'mention' | 'tag'; query: string } | null {
  const before = text.slice(0, cursorPos);
  const match = before.match(/[@#](\w*)$/);
  if (!match) return null;
  const trigger = before[before.length - match[0].length];
  return { type: trigger === '@' ? 'mention' : 'tag', query: match[1] };
}

// Normalized handle for @mention insertion (first word of display name)
export function mentionHandle(name: string): string {
  return name.split(' ')[0];
}
