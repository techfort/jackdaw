export const BEATS_PER_BAR = 4;

export const parseClockToken = (token: string): number | null => {
  const parts = token.trim().split(':').map(part => part.trim());
  if (parts.length < 2 || parts.length > 3) return null;

  const numericParts = parts.map(Number);
  if (numericParts.some(part => Number.isNaN(part) || part < 0)) return null;

  if (parts.length === 2) {
    const [minutes, seconds] = numericParts;
    return minutes * 60 + seconds;
  }

  const [hours, minutes, seconds] = numericParts;
  return hours * 3600 + minutes * 60 + seconds;
};

export const parseAbsolutePositionToken = (token: string, tempo: number): number | null => {
  const cleaned = token.trim();

  if (cleaned.includes(':')) return parseClockToken(cleaned);

  if (cleaned.includes('.')) {
    const pieces = cleaned.split('.');
    if (pieces.length < 2 || pieces.length > 3) return null;

    const bar = Number(pieces[0]);
    const beat = Number(pieces[1]);
    const subdivision = pieces[2] ? Number(pieces[2]) : 0;

    if (
      Number.isNaN(bar) || Number.isNaN(beat) || Number.isNaN(subdivision) ||
      bar < 1 || beat < 1 || subdivision < 0
    ) {
      return null;
    }

    const totalBeats = (bar - 1) * BEATS_PER_BAR + (beat - 1) + subdivision / 100;
    return totalBeats * (60 / tempo);
  }

  const seconds = Number(cleaned);
  if (Number.isNaN(seconds) || seconds < 0) return null;
  return seconds;
};

export const parseRelativeToken = (token: string, tempo: number): number | null => {
  const cleaned = token.trim();

  if (cleaned.includes(':')) return parseClockToken(cleaned);

  if (cleaned.includes('.')) {
    const pieces = cleaned.split('.');
    if (pieces.length < 1 || pieces.length > 3) return null;

    const bars = Number(pieces[0] || '0');
    const beats = Number(pieces[1] || '0');
    const subdivision = Number(pieces[2] || '0');

    if (
      Number.isNaN(bars) || Number.isNaN(beats) || Number.isNaN(subdivision) ||
      bars < 0 || beats < 0 || subdivision < 0
    ) {
      return null;
    }

    const totalBeats = bars * BEATS_PER_BAR + beats + subdivision / 100;
    return totalBeats * (60 / tempo);
  }

  const seconds = Number(cleaned);
  if (Number.isNaN(seconds) || seconds < 0) return null;
  return seconds;
};
