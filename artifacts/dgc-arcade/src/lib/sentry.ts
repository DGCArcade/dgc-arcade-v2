import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
const isProd = import.meta.env.PROD;

/**
 * Browser Sentry via @sentry/react (npm) — do NOT add the Loader Script to index.html.
 * Set VITE_SENTRY_DSN on Render at build time (Copy DSN from Sentry project settings).
 */
export function initSentry(): void {
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Tracing — Sentry wizard defaults to 1.0 for trial; 10% keeps free-tier span quota healthy
    tracesSampleRate: isProd ? 0.1 : 0,

    // Session replay — matches Sentry loader defaults
    replaysSessionSampleRate: isProd ? 0.1 : 0,
    replaysOnErrorSampleRate: 1.0,

    // Structured logs (5 GB/mo on Developer plan)
    enableLogs: isProd,
    beforeSendLog: (log) => {
      if (log.level === "debug") return null;
      return log;
    },
  });
}

export { Sentry };
