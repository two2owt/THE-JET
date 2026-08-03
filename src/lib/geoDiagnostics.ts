/**
 * Client-side geolocation diagnostics.
 *
 * Records every location event (raw fix, smoother rejection, DB write,
 * network-fallback usage) into a small in-memory ring buffer that is also
 * mirrored to `sessionStorage` so it survives a route change or reload while
 * troubleshooting. Nothing is sent to a server and nothing is kept beyond the
 * browser session.
 *
 * Inspect at any time from the browser console:
 *   __jetGeoLog()        -> array of recent events
 *   __jetGeoLog(true)    -> console.table of recent events
 *   __jetGeoSummary()    -> rolling counts (writes, fallbacks, failures)
 *   __jetGeoLogClear()   -> wipe the buffer
 */

export type GeoSource = "gps" | "network";

export type GeoEventKind =
  | "fix"
  | "rejected"
  | "write"
  | "write-failed"
  | "skipped";

export interface GeoLogEntry {
  at: string;
  kind: GeoEventKind;
  source: GeoSource;
  /** True when the coarse Google Geolocation fallback produced this event. */
  fallbackUsed: boolean;
  accuracy: number | null;
  lat?: number;
  lng?: number;
  /** Metres moved since the last recorded write, when known. */
  movedMeters?: number;
  /** Short reason for a rejection/skip, or an error message. */
  reason?: string;
}

const MAX_ENTRIES = 200;
const STORAGE_KEY = "jet-geo-diagnostics";

let buffer: GeoLogEntry[] = [];

function load() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) buffer = JSON.parse(raw) as GeoLogEntry[];
  } catch {
    buffer = [];
  }
}

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(buffer));
  } catch {
    /* storage blocked or full — the in-memory buffer still works */
  }
}

/** Round coordinates so the diagnostics log never stores a precise position. */
function coarse(value: number | undefined) {
  return typeof value === "number" ? Math.round(value * 1000) / 1000 : undefined;
}

export function logGeoEvent(entry: Omit<GeoLogEntry, "at">) {
  const record: GeoLogEntry = {
    ...entry,
    lat: coarse(entry.lat),
    lng: coarse(entry.lng),
    movedMeters:
      typeof entry.movedMeters === "number" && Number.isFinite(entry.movedMeters)
        ? Math.round(entry.movedMeters)
        : undefined,
    accuracy: typeof entry.accuracy === "number" ? Math.round(entry.accuracy) : null,
    at: new Date().toISOString(),
  };

  buffer.push(record);
  if (buffer.length > MAX_ENTRIES) buffer = buffer.slice(-MAX_ENTRIES);
  persist();

  if (import.meta.env.DEV) {
    const tag = record.fallbackUsed ? "network-fallback" : record.source;
    console.info(
      `[geo:${record.kind}] ${tag} acc=${record.accuracy ?? "n/a"}m` +
        (record.movedMeters !== undefined ? ` moved=${record.movedMeters}m` : "") +
        (record.reason ? ` (${record.reason})` : ""),
    );
  }
}

export function getGeoLog(): GeoLogEntry[] {
  return [...buffer];
}

export function clearGeoLog() {
  buffer = [];
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Rolling summary — the quickest answer to "is tracking actually working?". */
export function getGeoSummary() {
  const writes = buffer.filter((e) => e.kind === "write");
  const last = buffer[buffer.length - 1];
  const lastWrite = writes[writes.length - 1];
  const accuracies = writes
    .map((e) => e.accuracy)
    .filter((a): a is number => typeof a === "number");

  return {
    events: buffer.length,
    writes: writes.length,
    gpsWrites: writes.filter((e) => e.source === "gps").length,
    fallbackWrites: writes.filter((e) => e.fallbackUsed).length,
    failures: buffer.filter((e) => e.kind === "write-failed").length,
    rejections: buffer.filter((e) => e.kind === "rejected").length,
    avgWriteAccuracy: accuracies.length
      ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length)
      : null,
    lastEventAt: last?.at ?? null,
    lastWriteAt: lastWrite?.at ?? null,
    lastSource: last?.source ?? null,
  };
}

if (typeof window !== "undefined") {
  load();
  const w = window as unknown as Record<string, unknown>;
  w.__jetGeoLog = (table = false) => {
    const entries = getGeoLog();
    if (table) console.table(entries);
    return entries;
  };
  w.__jetGeoSummary = () => getGeoSummary();
  w.__jetGeoLogClear = () => clearGeoLog();
}

export default logGeoEvent;
