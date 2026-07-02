import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { CheckCircle2, Loader2 } from "lucide-react";
import { DepositResultLayout, DepositReceiptRows } from "@/components/deposit/deposit-result-layout";
import { formatCurrency } from "@/lib/format";

interface DepositStatusResponse {
  status: string;
  amount: string;
  currency: string;
  plisioTrackId?: string;
  orderId?: string;
  credited: boolean;
  liveBalance: number;
  receipt?: {
    requestedUsd?: number | string;
    creditedUsd?: number | string;
    receivedCrypto?: number | string;
    receivedUsd?: number | string;
  };
}

export default function DepositSuccessPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const orderId = params.get("order");
  const [data, setData] = useState<DepositStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const token = localStorage.getItem("dgc_token");
        const res = await fetch(`/api/transactions/deposit/status/${orderId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok && !cancelled) {
          setData(await res.json());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [orderId]);

  const creditedUsd = data?.receipt?.creditedUsd ?? data?.amount;
  const pending = data && data.status !== "completed";

  return (
    <DepositResultLayout
      accent="success"
      title={pending ? "Confirming deposit" : "Funds loaded"}
      subtitle={
        pending
          ? "Your payment is on-chain. This page updates automatically when we credit your sum actual."
          : "Your deposit cleared. We credited the actual amount received — after network and Plisio fees."
      }
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading receipt…</span>
        </div>
      ) : !orderId ? (
        <p className="text-sm text-muted-foreground text-center">No order ID in the URL. Check your profile transaction history.</p>
      ) : (
        <>
          <div className="flex items-center gap-3 justify-center pb-2">
            <CheckCircle2 className={`w-10 h-10 ${pending ? "text-amber-400" : "text-green-400"}`} />
            <div className="text-center sm:text-left">
              <p className="font-display font-black text-2xl text-primary">
                {creditedUsd != null ? formatCurrency(parseFloat(String(creditedUsd))) : "—"}
              </p>
              <p className="text-xs text-muted-foreground uppercase tracking-widest">
                {pending ? "Awaiting confirmation" : "Credited to your balance"}
              </p>
            </div>
          </div>
          <DepositReceiptRows
            status={data?.status}
            requestedUsd={data?.receipt?.requestedUsd}
            creditedUsd={creditedUsd}
            receivedCrypto={data?.receipt?.receivedCrypto}
            currency={data?.currency}
            plisioTrackId={data?.plisioTrackId}
            orderId={orderId}
          />
          {data?.liveBalance != null && (
            <p className="text-center text-sm text-muted-foreground pt-2">
              Live balance: <span className="text-foreground font-mono font-bold">{formatCurrency(data.liveBalance)}</span>
            </p>
          )}
        </>
      )}
    </DepositResultLayout>
  );
}
