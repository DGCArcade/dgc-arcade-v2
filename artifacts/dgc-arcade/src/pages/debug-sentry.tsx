import { useEffect, useRef, useState } from "react";
import { Sentry } from "@/lib/sentry";

const dsnConfigured = Boolean(import.meta.env.VITE_SENTRY_DSN?.trim());

export default function DebugSentryPage() {
  const sent = useRef(false);
  const [status, setStatus] = useState<"pending" | "sent" | "skipped">("pending");

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    if (!dsnConfigured) {
      setStatus("skipped");
      return;
    }

    Sentry.captureException(
      new Error("DGC Arcade Sentry debug test — safe to ignore/delete"),
      { tags: { source: "debug-sentry-route" } },
    );
    setStatus("sent");
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center gap-4 max-w-lg mx-auto">
      <h1 className="font-display font-black text-2xl uppercase tracking-widest">Sentry debug</h1>
      {status === "pending" && (
        <p className="text-muted-foreground text-sm">Sending test error to Sentry…</p>
      )}
      {status === "sent" && (
        <>
          <p className="text-muted-foreground text-sm">
            Test error sent. Check Sentry → Issues (environment: production) within ~30 seconds.
          </p>
          <p className="text-xs text-muted-foreground">
            Message: <span className="font-mono">DGC Arcade Sentry debug test</span>
          </p>
        </>
      )}
      {status === "skipped" && (
        <p className="text-muted-foreground text-sm">
          <code className="text-xs">VITE_SENTRY_DSN</code> is not set in this build — nothing was sent.
        </p>
      )}
    </div>
  );
}
