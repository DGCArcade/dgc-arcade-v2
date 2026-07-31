import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DepositForm } from "@/components/profile/deposit-form";
import { WithdrawForm } from "@/components/profile/withdraw-form";
import { WithdrawPolicyNotice } from "@/components/wallet/withdraw-policy-notice";
import { CoinIcon, getCurrencyMeta } from "@/components/wallet/coin-icon";
import { formatCurrency } from "@/lib/format";
import type { CryptoBalance } from "@/hooks/use-auth";
import { Landmark, Wallet } from "lucide-react";

interface ProfileBankSectionProps {
  totalBalance: number;
  cryptoBalances: CryptoBalance[];
  tipUsername: string;
  tipAmount: number;
  tipLoading: boolean;
  onTipUsernameChange: (v: string) => void;
  onTipAmountChange: (v: number) => void;
  onTipSubmit: () => void;
}

export function ProfileBankSection({
  totalBalance,
  cryptoBalances,
  tipUsername,
  tipAmount,
  tipLoading,
  onTipUsernameChange,
  onTipAmountChange,
  onTipSubmit,
}: ProfileBankSectionProps) {
  const [whole, frac] = formatCurrency(totalBalance).split(".");

  return (
    <Card className="bg-card border-border overflow-hidden">
      <div className="relative border-b border-primary/20 bg-gradient-to-br from-primary/10 via-transparent to-transparent">
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{ backgroundImage: "radial-gradient(circle, var(--primary) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        <CardHeader className="relative pb-3">
          <CardTitle className="font-display uppercase tracking-widest text-lg flex items-center gap-2">
            <Landmark className="w-5 h-5 text-primary" />
            <span className="text-glow-shift">DGC Bank</span>
          </CardTitle>
          <p className="text-xs text-muted-foreground font-mono">Your wallet · deposits · withdrawals</p>
        </CardHeader>
        <CardContent className="relative pt-0 pb-5 space-y-4">
          <div className="rounded-xl border border-primary/25 bg-secondary/40 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Total Balance</span>
            </div>
            <div className="font-mono font-black text-3xl text-primary drop-shadow-[0_0_15px_rgba(255,215,0,0.25)]">
              {whole}<span className="text-sm opacity-50">.{frac}</span>
            </div>
          </div>

          {cryptoBalances.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Crypto Breakdown</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {cryptoBalances.map((cb) => {
                  const meta = getCurrencyMeta(cb.currency);
                  const label = meta.network ? `USDT · ${meta.network}` : cb.currency.split("_")[0];
                  return (
                    <div key={cb.currency} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:border-primary/20 transition-all">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CoinIcon currency={cb.currency} size={22} />
                        <div className="min-w-0">
                          <p className="text-xs font-black uppercase tracking-widest truncate">{label}</p>
                          <p className="text-[10px] font-mono text-muted-foreground truncate">{cb.amount.toFixed(8)}</p>
                        </div>
                      </div>
                      <p className="text-xs font-mono font-bold text-primary shrink-0">{formatCurrency(cb.usdValue)}</p>
                    </div>
                  );
                })}
              </div>
              <p className="text-[9px] text-muted-foreground/60 text-right font-mono">Live market price · updates every 30s</p>
            </div>
          )}

          <WithdrawPolicyNotice />
        </CardContent>
      </div>

      <CardContent className="pt-5">
        <Tabs defaultValue="deposit" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 bg-secondary">
            <TabsTrigger value="deposit" className="font-bold uppercase text-xs">Deposit</TabsTrigger>
            <TabsTrigger value="withdraw" className="font-bold uppercase text-xs">Withdraw</TabsTrigger>
            <TabsTrigger value="tip" className="font-bold uppercase text-xs">Tip</TabsTrigger>
          </TabsList>
          <TabsContent value="deposit"><DepositForm /></TabsContent>
          <TabsContent value="withdraw"><WithdrawForm /></TabsContent>
          <TabsContent value="tip" className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground block mb-1">Recipient Username</label>
                <input type="text" value={tipUsername} onChange={(e) => onTipUsernameChange(e.target.value)} placeholder="username"
                  className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground block mb-1">Amount (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">$</span>
                  <input type="number" min={1} value={tipAmount} onChange={(e) => onTipAmountChange(Number(e.target.value))}
                    className="w-full rounded-md border border-border bg-secondary pl-8 pr-3 py-2 text-sm font-mono" />
                </div>
                <div className="flex gap-1 mt-2">
                  {[1, 5, 10, 25, 50].map((v) => (
                    <button key={v} type="button" onClick={() => onTipAmountChange(v)}
                      className="flex-1 text-xs py-1 rounded bg-secondary border border-border font-mono hover:border-primary/40 transition-colors">
                      ${v}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={onTipSubmit} disabled={tipLoading || !tipUsername.trim() || tipAmount <= 0}
                className="w-full h-10 rounded-md bg-primary text-primary-foreground font-bold uppercase tracking-widest text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors">
                {tipLoading ? "Sending…" : `Send ${formatCurrency(tipAmount)} Tip`}
              </button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
