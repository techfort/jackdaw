export interface TelemetryEvent {
  kind: string;
  ts: number;
  actor?: { userId: string; userName: string };
  payload?: Record<string, unknown>;
}

export const logTelemetryEvent = (event: Omit<TelemetryEvent, 'ts'>): void => {
  if (typeof window === 'undefined') return;
  const entry: TelemetryEvent = { ...event, ts: Date.now() };
  console.info('[jackdaw:telemetry]', JSON.stringify(entry));
};
