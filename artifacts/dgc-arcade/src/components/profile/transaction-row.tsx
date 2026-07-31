import { ArrowDownLeft, ArrowUpRight, ChevronRight, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { CoinIcon, getCurrencyMeta } from "@/components/wallet/coin-icon";

export interface ProfileTransaction {
  id: number;
  type: string;
  amount: number;
  currency?: string;
  status: string;
  txHash?: string | null;
  address?: string | null;
  plisioTrackId?: string | null;
  orderId?: string | null;
  createdAt: string;
}

function statusLabel(status: string) {
  switch (status) {
    case "needs_review": return "Under review";
    case "processing": return "Processing";
    default: return status.replace(/_/g, " ");
  }
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />;
  if (status === "failed") return <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />;
  if (status === "pending" || status === "processing" || status === "needs_review") {
    return <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse inline-block" />;
  }
  return null;
}

export function getTransactionInvoiceUrl(tx: ProfileTransaction): string | null {
  if (tx.plisioTrackId) return `https://plisio.net/invoice/${tx.plisioTrackId}`;
  if (tx.type === "deposit" && tx.orderId) return `https://plisio.net/invoice/${tx.orderId}`;
  return null;
}

export function TransactionRow({
  tx,
  onSelect,
}: {
  tx: ProfileTransaction;
  onSelect?: (tx: ProfileTransaction) => void;
}) {
  const isCredit = tx.type === "deposit" || tx.type === "bet_win" || tx.type === "tip_received";
  const currencyMeta = tx.currency ? getCurrencyMeta(tx.currency) : null;
  const hasInvoice = !!getTransactionInvoiceUrl(tx);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(tx)}
      className="w-full flex items-center justify-between p-3 rounded-lg border border-border/50 bg-secondary/30 hover:bg-secondary/60 hover:border-primary/30 transition-colors text-left group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`p-2 rounded-full shrink-0 ${isCredit ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}>
          {isCredit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-sm uppercase truncate">{tx.type.replace(/_/g, " ")}</p>
            {currencyMeta && <CoinIcon currency={tx.currency!} size={14} />}
          </div>
          <p className="text-xs text-muted-foreground font-mono truncate">{new Date(tx.createdAt).toLocaleString()}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex flex-col items-end gap-1">
          <span className={`font-mono font-bold text-sm ${isCredit ? "text-green-500" : "text-foreground"}`}>
            {isCredit ? "+" : "-"}{formatCurrency(tx.amount)}
          </span>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono uppercase">
            <StatusIcon status={tx.status} />
            <span>{statusLabel(tx.status)}</span>
          </div>
        </div>
        {(hasInvoice || onSelect) && (
          <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
        )}
      </div>
    </button>
  );
}

export function TransactionDetailModal({
  tx,
  onClose,
}: {
  tx: ProfileTransaction | null;
  onClose: () => void;
}) {
  if (!tx) return null;

  const invoiceUrl = getTransactionInvoiceUrl(tx);
  const isCredit = tx.type === "deposit" || tx.type === "bet_win" || tx.type === "tip_received";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-display font-black uppercase tracking-widest text-lg">
              {tx.type.replace(/_/g, " ")}
            </h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">Transaction #{tx.id}</p>
          </div>
          {tx.currency && <CoinIcon currency={tx.currency} size={28} />}
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount</span>
            <span className={`font-mono font-bold ${isCredit ? "text-green-500" : ""}`}>
              {isCredit ? "+" : "-"}{formatCurrency(tx.amount)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className="font-mono uppercase text-xs">{statusLabel(tx.status)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date</span>
            <span className="font-mono text-xs">{new Date(tx.createdAt).toLocaleString()}</span>
          </div>
          {tx.currency && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Currency</span>
              <span className="font-mono text-xs">{getCurrencyMeta(tx.currency).name}{getCurrencyMeta(tx.currency).network ? ` · ${getCurrencyMeta(tx.currency).network}` : ""}</span>
            </div>
          )}
          {tx.address && (
            <div className="space-y-1">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">Address</span>
              <p className="font-mono text-[10px] break-all bg-secondary/50 rounded p-2 border border-border/50">{tx.address}</p>
            </div>
          )}
          {tx.txHash && (
            <div className="space-y-1">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">Tx Hash</span>
              <p className="font-mono text-[10px] break-all bg-secondary/50 rounded p-2 border border-border/50">{tx.txHash}</p>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-border flex gap-2">
          {invoiceUrl && (
            <a
              href={invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground font-bold uppercase tracking-wider text-xs hover:bg-primary/90 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Invoice
            </a>
          )}
          <button
            onClick={onClose}
            className={`${invoiceUrl ? "" : "flex-1 "}py-2.5 px-4 rounded-lg border border-border font-bold uppercase tracking-wider text-xs hover:bg-secondary transition-colors`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
