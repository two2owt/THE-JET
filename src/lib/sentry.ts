/**
 * Sentry is loaded dynamically so it never lands in the main chunk.
 *
 * IMPORTANT: `VITE_SENTRY_DSN` is inlined at build time. If it is absent from
 * the production build environment, crash reporting silently no-ops and the
 * first bad release is invisible. `initSentry()` therefore logs loudly instead
 * of returning quietly, and `assertSentryConfigured()` lets CI fail a release
 * build that would ship blind.
 */

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

/** True when a DSN is present and Sentry will actually report. */
export const isSentryConfigured = () => Boolean(DSN);

let sentryReady: Promise<typeof import("@sentry/react") | null> | null = null;

export const initSentry = async () => {
  if (!import.meta.env.PROD) return;

  if (!DSN) {
    // Loud, once, in production only. A missing DSN is a deploy misconfig,
    // not a normal state.
    console.error(
      "[observability] VITE_SENTRY_DSN is not set in this production build — " +
        "crash reporting is DISABLED. Add the DSN to the build environment.",
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
