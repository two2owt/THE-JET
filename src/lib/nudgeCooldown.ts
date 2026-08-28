/**
 * Local ledger of "Never signed in" activation emails.
 *
 * Persists the last send timestamp per recipient so the panel can enforce a
 * configurable resend cooldown across reloads (the audience list itself is
 * rebuilt from the auth directory on every load, which has no send history).
 */

const LEDGER_KEY = "jet:nudge-sent-ledger";
const COOLDOWN_KEY = "jet:nudge-cooldown-hours";
const MAX_AGE_MS = 180 * 86_400_000; // prune entries older than 180 days

export const DEFAULT_COOLDOWN_HOURS = 72;

export const COOLDOWN_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "No cooldown" },
  { value: 24, label: "24 hours" },
  { value: 72, label: "3 days" },
  { value: 168, label: "7 days" },
  { value: 336, label: "14 days" },
  { value: 720, label: "30 days" },
];

export type NudgeLedger = Record<string, number>;

const canUseStorage = () => typeof window !== "undefined" && !!window.localStorage;

export const readNudgeLedger = (): NudgeLedger => {
  if (!canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(LEDGER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as NudgeLedger;
    if (!parsed || typeof parsed !== "object") return {};
    const cutoff = Date.now() - MAX_AGE_MS;
    const fresh: NudgeLedger = {};
    for (const [email, ts] of Object.entries(parsed)) {
      if (typeof ts === "number" && ts > cutoff) fresh[email.toLowerCase()] = ts;
    }
    return fresh;
  } catch {
    return {};
  }
};

export const writeNudgeLedger = (ledger: NudgeLedger) => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
  } catch {
    /* storage full or unavailable — cooldown degrades to session-only */
  }
};

export const recordNudgeSent = (email: string, at = Date.now()): NudgeLedger => {
  const ledger = readNudgeLedger();
  ledger[email.toLowerCase()] = at;
  writeNudgeLedger(ledger);
  return ledger;
};

export const readCooldownHours = (): number => {
  if (!canUseStorage()) return DEFAULT_COOLDOWN_HOURS;
  const raw = window.localStorage.getItem(COOLDOWN_KEY);
  const parsed = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_COOLDOWN_HOURS;
};

export const writeCooldownHours = (hours: number) => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(COOLDOWN_KEY, String(hours));
  } catch {
    /* ignore */
  }
};

/** Milliseconds remaining before `email` may be nudged again (0 = eligible). */
export const cooldownRemainingMs = (
  email: string | null | undefined,
  ledger: NudgeLedger,
  cooldownHours: number,
  now = Date.now(),
): number => {
  if (!email || cooldownHours <= 0) return 0;
  const last = ledger[email.toLowerCase()];
  if (!last) return 0;
  return Math.max(0, last + cooldownHours * 3_600_000 - now);
};

export const formatCooldownRemaining = (ms: number): string => {
  if (ms <= 0) return "";
  const totalMinutes = Math.ceil(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.ceil(totalMinutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.ceil(hours / 24)}d`;
};

/** RFC4180-ish CSV escaping. */
const csvCell = (value: string | null | undefined) => {
  const raw = value ?? "";
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
};

export const buildNudgeCsv = (
  rows: {
    email: string | null;
    display_name: string | null;
    created_at: string;
    id: string;
  }[],
  ledger: NudgeLedger,
  cooldownHours: number,
): string => {
  const header = [
    "email",
    "display_name",
    "user_id",
    "created_at",
    "days_since_created",
    "last_nudge_at",
    "eligible_now",
  ].join(",");
  const now = Date.now();
  const lines = rows.map((r) => {
    const last = r.email ? ledger[r.email.toLowerCase()] : undefined;
    const remaining = cooldownRemainingMs(r.email, ledger, cooldownHours, now);
    return [
      csvCell(r.email),
      csvCell(r.display_name),
      csvCell(r.id),
      csvCell(r.created_at),
      String(Math.max(0, Math.floor((now - new Date(r.created_at).getTime()) / 86_400_000))),
      csvCell(last ? new Date(last).toISOString() : ""),
      remaining > 0 ? "no" : "yes",
    ].join(",");
  });
  return [header, ...lines].join("\r\n");
};

export const downloadCsv = (filename: string, csv: string) => {
  if (typeof document === "undefined") return;
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
