import { ReactNode } from "react";
import { Shield } from "lucide-react";
import { Link } from "wouter";

interface DepositResultLayoutProps {
  title: string;
  subtitle: string;
  accent: "success" | "failed";
  children: ReactNode;
}

export function DepositResultLayout({ title, subtitle, accent, children }: DepositResultLayoutProps) {
  const isSuccess = accent === "success";
  return (
    <div className="max-w-2xl mx-auto py-12 px-4 space-y-8">
      <section className="text-center space-y-4">
        <div
          className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-2 border ${
            isSuccess ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"
          }`}
        >
          <Shield className={`w-4 h-4 ${isSuccess ? "text-green-400" : "text-red-400"}`} />
          <span className={`text-xs font-bold uppercase tracking-widest ${isSuccess ? "text-green-400" : "text-red-400"}`}>
            {isSuccess ? "Deposit confirmed" : "Deposit not completed"}
          </span>
        </div>
        <h1 className="font-display font-black text-3xl md:text-5xl uppercase tracking-tighter leading-none">
          {title}
        </h1>
        <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed">{subtitle}</p>
      </section>

      <div className="rounded-2xl border border-border/40 bg-secondary/20 p-6 md:p-8 space-y-6 shadow-[0_0_40px_rgba(0,0,0,0.25)]">
        {children}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/games"
          className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold uppercase tracking-widest px-8 py-3 text-sm hover:opacity-90 transition-opacity"
        >
          Play now
        </Link>
        <Link
          href="/profile"
          className="inline-flex items-center justify-center rounded-lg border border-border bg-secondary/40 font-bold uppercase tracking-widest px-8 py-3 text-sm hover:border-primary/40 transition-colors"
        >
          Wallet &amp; profile
        </Link>
      </div>
    </div>
  );
}

function ReceiptRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold shrink-0">{label}</span>
      <span className={`text-sm font-mono text-right break-all ${highlight ? "text-primary font-bold" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

export function DepositReceiptRows({
  requestedUsd,
  creditedUsd,
  receivedCrypto,
  currency,
  plisioTrackId,
  orderId,
  status,
}: {
  requestedUsd?: string | number | null;
  creditedUsd?: string | number | null;
  receivedCrypto?: string | number | null;
  currency?: string | null;
  plisioTrackId?: string | null;
  orderId?: string | null;
  status?: string | null;
}) {
  const coin = currency?.split("_")[0] ?? "—";
  return (
    <div className="space-y-1">
      {status && <ReceiptRow label="Status" value={status.toUpperCase()} highlight />}
      {requestedUsd != null && (
        <ReceiptRow label="Invoice requested" value={`$${parseFloat(String(requestedUsd)).toFixed(2)}`} />
      )}
      {receivedCrypto != null && (
        <ReceiptRow label="Sum actual (on-chain)" value={`${parseFloat(String(receivedCrypto)).toFixed(8)} ${coin}`} />
      )}
      {creditedUsd != null && (
        <ReceiptRow label="Credited to balance" value={`$${parseFloat(String(creditedUsd)).toFixed(2)}`} highlight />
      )}
      {orderId && <ReceiptRow label="Order ID" value={orderId} />}
      {plisioTrackId && <ReceiptRow label="Plisio invoice ID" value={plisioTrackId} />}
      <p className="text-[10px] text-muted-foreground pt-3 leading-relaxed">
        We credit the <strong className="text-foreground">sum actual</strong> — what actually landed after network and processor fees — not the invoice estimate.
      </p>
    </div>
  );
}
