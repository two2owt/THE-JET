/**
 * Detects when the browser will silently refuse to show the geolocation
 * prompt again (Chrome/Safari auto-block after repeated dismissals, embedded
 * webviews, insecure/blocked contexts).
 *
 * Signals we treat as "the prompt is suppressed":
 *  - `getCurrentPosition` fails with PERMISSION_DENIED almost instantly, which
 *    means no UI was ever shown to the user.
 *  - Two consecutive prompt attempts end with the permission still in the
 *    "prompt" state (no decision was recorded).
 *
 * When suppressed, UI should stop retrying the prompt and send the user
 * straight to the OS/browser settings instead.
 */
const KEY = "jet_geo_prompt_suppressed_v1";
const ATTEMPTS_KEY = "jet_geo_prompt_noop_attempts_v1";
const NO_UI_THRESHOLD_MS = 600;
const MAX_NOOP_ATTEMPTS = 2;

export const GEO_PROMPT_SUPPRESSION_EVENT = "jet:geo-prompt-suppression";

function read(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (typeof window === "undefined") return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

function emit() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GEO_PROMPT_SUPPRESSION_EVENT));
}

export function isPromptSuppressed(): boolean {
  return read(KEY) === "1";
}

export function markPromptSuppressed() {
  if (isPromptSuppressed()) return;
  write(KEY, "1");
  emit();
}

/** A real decision (granted or denied) means prompting works again. */
export function clearPromptSuppression() {
  const had = isPromptSuppressed() || read(ATTEMPTS_KEY) !== null;
  write(KEY, null);
  write(ATTEMPTS_KEY, null);
  if (had) emit();
}

/**
 * Records the outcome of one prompt attempt and returns whether the browser
 * now looks like it will never prompt again.
 */
export function recordPromptAttempt(opts: {
  /** Permission state observed after the attempt. */
  outcome: "granted" | "denied" | "prompt" | "unknown" | "unsupported";
  /** How long the attempt took, in ms. */
  durationMs: number;
  /** True when the attempt failed with PERMISSION_DENIED. */
  deniedError?: boolean;
}): boolean {
  const { outcome, durationMs, deniedError } = opts;

  if (outcome === "granted") {
    clearPromptSuppression();
    return false;
  }

  // Instant denial = the browser auto-blocked without showing any UI.
  if (deniedError && durationMs < NO_UI_THRESHOLD_MS) {
    markPromptSuppressed();
    return true;
  }

  if (outcome === "denied") {
    // The user actually saw and answered the prompt.
    clearPromptSuppression();
    return false;
  }

  // Still "prompt": no decision was recorded. Repeated no-ops mean the browser
  // is swallowing the request.
  const attempts = Number(read(ATTEMPTS_KEY) ?? "0") + 1;
  write(ATTEMPTS_KEY, String(attempts));
  if (attempts >= MAX_NOOP_ATTEMPTS || durationMs < NO_UI_THRESHOLD_MS) {
    markPromptSuppressed();
    return true;
  }
  return false;
}

export function subscribeToPromptSuppression(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(GEO_PROMPT_SUPPRESSION_EVENT, cb);
  return () => window.removeEventListener(GEO_PROMPT_SUPPRESSION_EVENT, cb);
}
