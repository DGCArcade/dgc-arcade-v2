import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { AlertTriangle, Loader2 } from "lucide-react";
import { DepositResultLayout, DepositReceiptRows } from "@/components/deposit/deposit-result-layout";

const FAIL_REASONS: Record<string, string> = {
  cancelled: "You closed or cancelled the payment before it completed.",
  expired: "The invoice expired before enough crypto arrived on-chain.",
  error: "The payment processor reported an error.",
  mismatch: "The amount sent didn't match the invoice (underpayment). Contact support if funds left your wallet.",
  default: "The deposit didn't complete. If you already sent crypto, it may still confirm — check back shortly or contact support with your order ID.",
};

export default function DepositFailedPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const orderId = params.get("order");
  const reasonKey = params.get("reason") ?? "default";
  const [data, setData] = useState<{
    status: string;
    currency?: string;
    plisioTrackId?: string;
    receipt?: { requestedUsd?: number | string };
  } | null>(null);
  const [loading, setLoading] = useState(!!orderId);

  useEffect(() => {
    if (!orderId) return;
    const token = localStorage.getItem("dgc_token");
    fetch(`/api/transactions/deposit/status/${orderId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [orderId]);

  const explanation = FAIL_REASONS[reasonKey] ?? FAIL_REASONS.default;

  return (
    <DepositResultLayout
      accent="failed"
      title="Deposit not completed"
      subtitle={explanation}
    >
      <div className="flex items-start gap-3 text-sm text-muted-foreground">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <div className="space-y-2">
          <p>
            No funds were credited to your playable balance. If you <strong className="text-foreground">did send crypto</strong>,
            wait a few minutes — blockchain confirmations can take time. This page won't charge you twice.
          </p>
          <p>
            Common causes: wrong network, underpayment, invoice timeout, or closing the Plisio checkout early.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Checking order status…</span>
        </div>
      ) : orderId ? (
        <DepositReceiptRows
          status={data?.status ?? "failed"}
          requestedUsd={data?.receipt?.requestedUsd}
          currency={data?.currency}
          plisioTrackId={data?.plisioTrackId}
          orderId={orderId}
        />
      ) : null}

      <p className="text-[10px] text-center text-muted-foreground">
        Need help? Email <strong className="text-foreground">support@dgcarcade.com</strong> with your order ID.
      </p>
    </DepositResultLayout>
  );
}
