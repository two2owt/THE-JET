/**
 * Determines if a venue is currently open based on Google Places `weekday_text`
 * (e.g. "Monday: 9:00 AM – 10:00 PM", "Tuesday: Closed",
 * "Friday: 5:00 PM – 2:00 AM" with overnight wrap, "Saturday: Open 24 hours").
 * All comparisons use the user's local device time.
 *
 * Returns:
 *   true  - venue is open right now
 *   false - venue is closed right now
 *   null  - hours unknown / unparseable (caller should keep marker visible)
 */

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** Parse "9:00 AM" / "12:30 PM" / "9 PM" / "00:00" into minutes-of-day (0–1439). */
function parseTimeToMinutes(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  // 24-hour "HH:MM"
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = parseInt(m24[1], 10);
    const m = parseInt(m24[2], 10);
    if (h <= 24 && m < 60) return (h % 24) * 60 + m;
  }
  // 12-hour "h[:mm] am/pm"
  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const m = m12[2] ? parseInt(m12[2], 10) : 0;
    const ap = m12[3];
    if (h < 1 || h > 12 || m >= 60) return null;
    if (ap === "am") h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
    return h * 60 + m;
  }
  return null;
}

/** Check membership in [start, end) on a 0..1440 minute scale, supporting overnight wrap. */
function inRange(now: number, start: number, end: number): boolean {
  if (end === start) return false;
  if (end > start) return now >= start && now < end;
  // Overnight (e.g. 17:00 – 02:00)
  return now >= start || now < end;
}

/**
 * Parse a single Google Places weekday_text line and return whether the
 * supplied "now minutes" falls inside any of its intervals.
 * Returns null if the line is unparseable.
 */
function isOpenForLine(line: string, nowMinutes: number, isToday: boolean): boolean | null {
  // Strip "Monday: " prefix
  const colon = line.indexOf(":");
  const value = (colon >= 0 ? line.slice(colon + 1) : line).trim().toLowerCase();

  if (!value || value === "closed") return false;
  if (value.includes("24 hours") || value.includes("open 24")) return true;

  // Multiple intervals separated by comma. Use a regex that tolerates
  // unicode dashes (–, —, -) and "to".
  const intervals = value.split(",").map((s) => s.trim()).filter(Boolean);
  let parsedAny = false;
  for (const iv of intervals) {
    const parts = iv.split(/\s*[\u2013\u2014\-]\s*|\s+to\s+/);
    if (parts.length !== 2) continue;
    const start = parseTimeToMinutes(parts[0]);
    const end = parseTimeToMinutes(parts[1]);
    if (start === null || end === null) continue;
    parsedAny = true;
    // Overnight intervals only count as "open now" if `isToday` (carry-over
    // from yesterday is handled by the previous day's line).
    if (end <= start) {
      if (isToday && nowMinutes >= start) return true;
    } else if (isToday && inRange(nowMinutes, start, end)) {
      return true;
    }
  }
  return parsedAny ? false : null;
}

/**
 * Given Google Places `weekday_text`, evaluate against the device's current
 * local time. Handles overnight closing carry-over from the prior day.
 */
export function isVenueOpenNow(
  weekdayText: readonly string[] | undefined,
  now: Date = new Date()
): boolean | null {
  if (!weekdayText?.length) return null;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayDow = now.getDay(); // 0 = Sunday
  const yesterdayDow = (todayDow + 6) % 7;

  // Match each line by leading day name (case-insensitive). Google returns
  // localized text; if names don't match, fall back to array order starting
  // with Monday (Google's documented order).
  const byDay = new Map<number, string>();
  for (const line of weekdayText) {
    const lower = line.toLowerCase();
    const idx = DAY_NAMES.findIndex((d) => lower.startsWith(d));
    if (idx >= 0) byDay.set(idx, line);
  }
  if (byDay.size === 0) {
    // Fallback: assume Monday-first ordering
    weekdayText.forEach((line, i) => byDay.set((i + 1) % 7, line));
  }

  const todayLine = byDay.get(todayDow);
  const yLine = byDay.get(yesterdayDow);

  let result: boolean | null = null;

  if (todayLine) {
    const r = isOpenForLine(todayLine, nowMinutes, true);
    if (r === true) return true;
    if (r !== null) result = r;
  }

  // Check overnight carry-over from yesterday (e.g. yesterday 5pm–2am, now 1am).
  if (yLine) {
    const colon = yLine.indexOf(":");
    const value = (colon >= 0 ? yLine.slice(colon + 1) : yLine).trim().toLowerCase();
    if (value && value !== "closed") {
      for (const iv of value.split(",").map((s) => s.trim())) {
        const parts = iv.split(/\s*[\u2013\u2014\-]\s*|\s+to\s+/);
        if (parts.length !== 2) continue;
        const start = parseTimeToMinutes(parts[0]);
        const end = parseTimeToMinutes(parts[1]);
        if (start === null || end === null) continue;
        if (end <= start && nowMinutes < end) return true;
      }
    }
  }

  return result;
}