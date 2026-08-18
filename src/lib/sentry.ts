// Dynamically import Sentry only when needed to avoid bundling with main chunk
export const initSentry = async () => {
  // Only load Sentry in production
  if (!import.meta.env.PROD || !import.meta.env.VITE_SENTRY_DSN) {
    return;
  }

  // Dynamic import ensures Sentry is in its own chunk and only loaded when called
  const Sentry = await import("@sentry/react");

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 0.1, // Reduced from 1.0 to lower overhead
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    environment: import.meta.env.MODE,
  });
};

// Lazy getter for Sentry - only use when you need to capture errors manually
export const getSentry = async () => {
  if (!import.meta.env.PROD) return null;
  return import("@sentry/react");
};
