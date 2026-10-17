// A user's day is their local calendar day. toISOString() gives the UTC day,
// which in India is still yesterday until 05:30.

export function validZone(tz?: string): string | undefined {
  if (!tz) return undefined;
  try { new Intl.DateTimeFormat("en-CA", { timeZone: tz }); return tz; } catch { return "UTC"; }
}

// YYYY-MM-DD. Without a zone it uses the runtime's own: the browser's on the
// client, UTC on the server.
export function localDay(d: Date = new Date(), tz?: string): string {
  return d.toLocaleDateString("en-CA", { timeZone: validZone(tz) });
}
