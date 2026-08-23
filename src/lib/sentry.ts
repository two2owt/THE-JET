/**
 * Sentry is loaded dynamically so it never lands in the main chunk.
 *
 * The DSN is a *publishable* credential — it ships inside every browser bundle
 * by design and only grants the ability to send events to this project. We
 * therefore keep the JET project DSN in source as the default so production
 * crash reporting can never silently ship blind on a missing build variable.
 * `VITE_SENTRY_DSN` still wins when set, so a fork or a separate environment
 * can point at its own Sentry project without a code change.
 */

/** JET's Sentry project (creative-breakroom-llc-s2 / jet-around). */
const DEFAULT_DSN =
  "https://7ccf8418e29c6b170be8765548d80e18@o4511957624553472.ingest.us.sentry.io/4511957744680960";

const DSN =
  (import.meta.env.VITE_SENTRY_DSN as string | undefined) || DEFAULT_DSN;

/** True when a DSN is present and Sentry will actually report. */
export const isSentryConfigured = () => Boolean(DSN);

let sentryReady: Promise<typeof import("@sentry/react") | null> | null = null;

export const initSentry = async () => {
  if (!import.meta.env.PROD) return;

  if (!DSN) {
    // Should be unreachable now that a default ships in source, but a bad
    // override should still be loud rather than silently disabling reporting.
    console.error(
      "[observability] No Sentry DSN resolved — crash reporting is DISABLED.",
    );
    return;
  }

  const Sentry = await import("@sentry/react");

  Sentry.init({
    dsn: DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION as string | undefined,
  });

  sentryReady = Promise.resolve(Sentry);
};

/** Lazy getter for Sentry — only resolves when reporting is actually live. */
export const getSentry = async () => {
  if (!import.meta.env.PROD || !DSN) return null;
  if (!sentryReady) sentryReady = import("@sentry/react");
  return sentryReady;
};

/**
 * Report a caught error. Safe to call anywhere — falls back to console when
 * Sentry is unavailable so nothing is ever swallowed.
 */
export const reportError = async (
  error: unknown,
  context?: Record<string, unknown>,
) => {
  try {
    const Sentry = await getSentry();
    if (Sentry) {
      Sentry.captureException(error, context ? { extra: context } : undefined);
      return;
    }
  } catch {
    /* reporting must never throw */
  }
  console.error("[observability]", error, context ?? "");
};
