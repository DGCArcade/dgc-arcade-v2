import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, AlertTriangle, Circle } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { getApiUrl } from "@/lib/api-fetch";

export interface WithdrawalTrackerProps {
  transactionId: number;
  initialStatus?: string;
  amount?: number;
  currency?: string;
  onComplete?: () => void;
}

type Step = "requested" | "processing" | "completed" | "failed";

const STEPS: { id: Step; label: string }[] = [
  { id: "requested", label: "Requested" },
  { id: "processing", label: "Processing" },
  { id: "completed", label: "Sent" },
];

function mapStatus(status: string): Step {
  if (status === "completed") return "completed";
  if (status === "processing") return "processing";
  if (status === "failed" || status === "cancelled") return "failed";
  return "requested";
}

function stepIndex(step: Step): number {
  if (step === "failed") return 1;
  return STEPS.findIndex(s => s.id === step);
}

export function WithdrawalTracker({
  transactionId,
  initialStatus = "pending",
  amount,
  currency,
  onComplete,
}: WithdrawalTrackerProps) {
  const [status, setStatus] = useState(mapStatus(initialStatus));
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const token = localStorage.getItem("dgc_token");
        const res = await fetch(getApiUrl(`/api/transactions/${transactionId}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const next = mapStatus(data.status ?? initialStatus);
        setStatus(next);
        if (data.txHash) setTxHash(data.txHash);
        if (next === "completed" && onComplete) onComplete();
      } catch {
        // ignore poll errors
      }
    };

    poll();
    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [transactionId, initialStatus, onComplete]);

  const activeIdx = stepIndex(status);
  const isFailed = status === "failed";

  return (
    <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Withdrawal Tracker</p>
          {amount != null && (
            <p className="font-mono font-black text-lg">
              {formatCurrency(amount)} {currency && currency !== "USD" ? currency : ""}
            </p>
          )}
        </div>
        <span className="text-[10px] font-mono uppercase text-muted-foreground">#{transactionId}</span>
      </div>

      <div className="flex items-center gap-2">
        {STEPS.map((step, i) => {
          const done = !isFailed && i < activeIdx;
          const active = !isFailed && i === activeIdx;
          const Icon = done ? CheckCircle2 : active ? Loader2 : Circle;
          return (
            <div key={step.id} className="flex-1 flex flex-col items-center gap-1">
              <Icon
                className={`w-5 h-5 ${
                  done ? "text-green-500" : active ? "text-primary animate-spin" : "text-muted-foreground/40"
                }`}
              />
              <span className={`text-[9px] uppercase font-bold tracking-wide text-center ${
                done || active ? "text-foreground" : "text-muted-foreground"
              }`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {isFailed && (
        <div className="flex items-start gap-2 text-amber-400 text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Your withdrawal needs review or could not be sent automatically. Check your email or contact support.</span>
        </div>
      )}

      {status === "completed" && txHash && (
        <div className="text-[10px] font-mono text-muted-foreground break-all">
          Tx: {txHash}
        </div>
      )}

      {status !== "completed" && !isFailed && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          Updates every 5 seconds · confirmation email sent at each stage
        </div>
      )}
    </div>
  );
}
