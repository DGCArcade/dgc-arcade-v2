import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useInitiateDeposit, useRequestWithdrawal, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { ExternalLink, Send, Wallet, ArrowDownToLine, ArrowUpFromLine, Lock, Unlock, Eye, EyeOff, RefreshCw } from "lucide-react";
import { CoinIcon, CURRENCIES } from "./coin-icon";
import { getApiUrl } from "@/lib/api-fetch";
import { useWagerRequirement } from "@/hooks/use-wager-requirement";
import { WithdrawPolicyNotice } from "./withdraw-policy-notice";

interface WalletModalProps {
  open: boolean;
  onClose: () => void;
}

interface CoinBalanceData {
  balances: Record<string, number>;        // live USD value per coin
  totalBalance: number;                    // total live balance (crypto + static)
  staticBalance: number;                   // legacy USD-only balance
  cryptoAmounts: Record<string, {          // raw crypto amounts + price
    amount: number;
    price: number;
    usdValue: number;
  }>;
}

export function WalletModal({ open, onClose }: WalletModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initiateDeposit = useInitiateDeposit();
  const requestWithdrawal = useRequestWithdrawal();

  const [currency, setCurrency] = useState("BTC");
  const [amount, setAmount] = useState(50);
  const [withdrawAmount, setWithdrawAmount] = useState(1);
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawCurrency, setWithdrawCurrency] = useState("BTC");
  const [tipUsername, setTipUsername] = useState("");
  const [tipAmount, setTipAmount] = useState(5);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [depositResult, setDepositResult] = useState<{address: string; qrCode: string; paymentUrl: string; orderId?: string} | null>(null);
  const [depositStatus, setDepositStatus] = useState<"pending" | "completed" | null>(null);
  const [depositCredited, setDepositCredited] = useState<{amount: string; currency: string} | null>(null);
  const [copied, setCopied] = useState(false);

  // Live coin balance state (refreshed from backend on every open + after withdrawal)
  const [coinData, setCoinData] = useState<CoinBalanceData>({
    balances: {},
    totalBalance: 0,
    staticBalance: 0,
    cryptoAmounts: {},
  });
  const [coinBalancesLoading, setCoinBalancesLoading] = useState(true);

  // Vault state
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultVisible, setVaultVisible] = useState(() => localStorage.getItem("dgc_vault_visible") !== "false");
  const [vaultDepositAmt, setVaultDepositAmt] = useState(10);
  const [vaultWithdrawAmt, setVaultWithdrawAmt] = useState(10);
  const [vaultPassword, setVaultPassword] = useState("");
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultShowWithdraw, setVaultShowWithdraw] = useState(false);

  // ── Fetch live coin balances from backend ──────────────────────────────────
  const fetchCoinBalances = useCallback(async () => {
    setCoinBalancesLoading(true);
    try {
      const token = localStorage.getItem("dgc_token");
      const r = await fetch(getApiUrl("/api/transactions/coin-balances"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const d: CoinBalanceData = await r.json();
        setCoinData(d);

        // Auto-select the first coin that has a live balance, or keep current if still valid
        const availableCoins = Object.keys(d.balances).filter(k => (d.balances[k] ?? 0) > 0);
        if (availableCoins.length > 0 && !availableCoins.includes(withdrawCurrency)) {
          setWithdrawCurrency(availableCoins[0]);
        }
      }
    } catch (_) {
      // Silently fail — user still sees their balance from useAuth
    } finally {
      setCoinBalancesLoading(false);
    }
  }, [withdrawCurrency]);

  // Refresh on open + every 5 seconds while open (live prices)
  useEffect(() => {
    if (!open) return;
    fetchCoinBalances();
    const interval = setInterval(fetchCoinBalances, 5_000);
    return () => clearInterval(interval);
  }, [open, fetchCoinBalances]);

  // ── STEP 4: Poll deposit status every 5s while address is shown ────────────
  // The moment Plisio confirms receipt and our callback credits the balance,
  // the user sees "✓ Payment Received!" and their new balance live — no redirect needed.
  useEffect(() => {
    if (!depositResult?.orderId || depositStatus === "completed") return;
    const token = localStorage.getItem("dgc_token");
    const poll = async () => {
      try {
        const r = await fetch(getApiUrl(`/api/transactions/deposit/status/${depositResult.orderId}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) return;
        const d = await r.json();
        if (d.credited && d.status === "completed") {
          setDepositStatus("completed");
          setDepositCredited({ amount: d.amount, currency: d.currency });
          // Immediately refresh coin balances and the auth user (live balance)
          fetchCoinBalances();
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          toast({
            title: "✓ Payment Received!",
            description: `${d.amount} ${d.currency} credited — your balance has been updated.`,
          });
        } else {
          setDepositStatus("pending");
        }
      } catch (_) { /* silent — user still sees balance from auth */ }
    };
    poll();
    const interval = setInterval(poll, 5_000);
    return () => clearInterval(interval);
  }, [depositResult?.orderId, depositStatus, fetchCoinBalances, queryClient]);

  // Fetch vault balance
  useEffect(() => {
    if (!open) return;
    const token = localStorage.getItem("dgc_token");
    fetch(getApiUrl("/api/users/me/vault"), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.vaultBalance !== undefined) setVaultBalance(parseFloat(d.vaultBalance)); })
      .catch(() => {});
  }, [open]);

  const selectedCurrency = CURRENCIES.find(c => c.value === currency) ?? CURRENCIES[0];
  // Creator accounts (withdrawalsEnabled === false) only see Vault
  const isCreator = user?.withdrawalsEnabled === false;
  const { isWagerMet, wagerRemaining } = useWagerRequirement();

  // ── Live balance values ────────────────────────────────────────────────────
  // totalBalance from coinData is the live backend value (crypto + static USD).
  // Fall back to user.balance from /auth/me if coinData hasn't loaded yet.
  const liveTotal = coinData.totalBalance > 0 ? coinData.totalBalance : (user?.balance ?? 0);
  const hasBalance = liveTotal > 0;

  // For the selected withdrawal coin: the live USD value available in that coin
  const coinLiveUsd = coinData.balances[withdrawCurrency] ?? 0;

  // Max the user can withdraw for the selected coin:
  //   • If they have crypto rows: min(live coin USD value, total live balance)
  //   • If they only have static USD balance (old user): total live balance
  const hasCryptoBalances = Object.keys(coinData.balances).some(k => (coinData.balances[k] ?? 0) > 0);
  const maxWithdrawForCoin = hasCryptoBalances
    ? Math.min(coinLiveUsd, liveTotal)
    : 0;

  // Only coins with deposited balance are withdrawable
  const withdrawableCurrencies = CURRENCIES.filter(c =>
    hasCryptoBalances ? (coinData.balances[c.value] ?? 0) > 0 : false,
  );

  // Whether the selected coin is available for withdrawal
  const isCoinAvailable = withdrawableCurrencies.some(c => c.value === withdrawCurrency);

  const handleDeposit = () => {
    initiateDeposit.mutate({ data: { amount, currency } } as any, {
      onSuccess: (res: any) => {
        setDepositResult({ address: res.address, qrCode: res.qrCode, paymentUrl: res.paymentUrl, orderId: res.orderId });
        setDepositStatus("pending");
        setDepositCredited(null);
        setPaymentUrl(res.paymentUrl);
        if (!res?.address && res?.paymentUrl) {
          window.open(res.paymentUrl, "_blank", "noopener,noreferrer");
        }
        toast({ title: "Deposit Address Ready", description: "Send crypto to the address shown. We'll notify you the instant it's confirmed." });
      },
      onError: (err: unknown) => {
        const msg = (err as {data?: {error?: string}})?.data?.error ?? "Error";
        toast({ title: "Deposit Failed", description: msg, variant: "destructive" });
      }
    });
  };

  const handleWithdraw = () => {
    if (!isWagerMet) {
      toast({
        title: "Playthrough required",
        description: `Wager ${formatCurrency(wagerRemaining)} more before withdrawing.`,
        variant: "destructive",
      });
      return;
    }
    if (!withdrawAddress) { toast({ title: "Address required", variant: "destructive" }); return; }
    if (withdrawAmount <= 0) { toast({ title: "Amount must be greater than 0", variant: "destructive" }); return; }
    if (withdrawAmount > liveTotal) {
      toast({ title: "Insufficient balance", description: `Your live balance is ${formatCurrency(liveTotal)}`, variant: "destructive" });
      return;
    }
    if (hasCryptoBalances && withdrawAmount > coinLiveUsd) {
      toast({
        title: "Exceeds coin balance",
        description: `You only have ${formatCurrency(coinLiveUsd)} in ${withdrawCurrency.split("_")[0]}. Choose a different coin or reduce the amount.`,
        variant: "destructive",
      });
      return;
    }

    requestWithdrawal.mutate({ data: { amount: withdrawAmount, currency: withdrawCurrency, address: withdrawAddress } }, {
      onSuccess: () => {
        toast({ title: "Withdrawal Requested", description: "Your withdrawal is being processed." });
        // Invalidate user balance AND refresh coin balances
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        fetchCoinBalances();
        setWithdrawAddress("");
        setWithdrawAmount(1);
      },
      onError: (err: unknown) => {
        const msg = (err as {data?: {error?: string}})?.data?.error ?? "Error";
        toast({ title: "Withdrawal Failed", description: msg, variant: "destructive" });
      }
    });
  };

  const handleTip = async () => {
    if (!tipUsername || tipAmount <= 0) return;
    const token = localStorage.getItem("dgc_token");
    const res = await fetch(getApiUrl("/api/users/tip"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ toUsername: tipUsername, amount: tipAmount }),
    });
    if (res.ok) {
      toast({ title: `Tipped ${formatCurrency(tipAmount)} to ${tipUsername}!` });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setTipUsername("");
    } else {
      const d = await res.json().catch(() => ({}));
      toast({ title: "Tip Failed", description: d.error ?? "Error", variant: "destructive" });
    }
  };

  const handleVaultDeposit = async () => {
    if (vaultDepositAmt <= 0) return;
    setVaultLoading(true);
    try {
      const token = localStorage.getItem("dgc_token");
      const res = await fetch(getApiUrl("/api/users/me/vault/deposit"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: vaultDepositAmt }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setVaultBalance(d.vaultBalance ?? 0);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast({ title: `${formatCurrency(vaultDepositAmt)} locked in vault!` });
      } else {
        toast({ title: "Vault Deposit Failed", description: d.error ?? "Error", variant: "destructive" });
      }
    } finally {
      setVaultLoading(false);
    }
  };

  const handleVaultWithdraw = async () => {
    if (vaultWithdrawAmt <= 0 || !vaultPassword) return;
    setVaultLoading(true);
    try {
      const token = localStorage.getItem("dgc_token");
      const res = await fetch(getApiUrl("/api/users/me/vault/withdraw"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: vaultWithdrawAmt, password: vaultPassword }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setVaultBalance(d.vaultBalance ?? 0);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setVaultPassword("");
        setVaultShowWithdraw(false);
        toast({ title: `${formatCurrency(vaultWithdrawAmt)} released from vault!` });
      } else {
        toast({ title: "Vault Withdraw Failed", description: d.error ?? "Error", variant: "destructive" });
      }
    } finally {
      setVaultLoading(false);
    }
  };

  const toggleVaultVisibility = () => {
    const next = !vaultVisible;
    setVaultVisible(next);
    localStorage.setItem("dgc_vault_visible", String(next));
  };

  // For creators: only Vault tab. For regular: Deposit + Withdraw + Tip + Vault
  // On mobile (< sm) use a 2x2 grid; on sm+ use a single row of 4
  const tabCols = isCreator ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-4";
  const defaultTab = isCreator ? "vault" : "deposit";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent hideClose className="max-w-md w-full bg-card border-border/60 backdrop-blur-xl p-0 overflow-hidden max-h-[100dvh] sm:max-h-[90vh] mx-0 sm:mx-auto rounded-none sm:rounded-2xl flex flex-col">
        {/* Header with Close Button */}
        <div className="p-4 sm:p-6 pb-0 border-b border-border/40 flex items-center justify-between">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display font-black text-lg sm:text-xl uppercase tracking-widest">
              <Wallet className="w-4 sm:w-5 h-4 sm:h-5 text-primary" />
              Wallet
            </DialogTitle>
          </DialogHeader>
          <button
            onClick={onClose}
            className="ml-2 p-2 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Close wallet"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Balances */}
        <div className="mt-3 mb-3 space-y-2 px-4 sm:px-6">
          <div className="bg-secondary/60 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-primary/20">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-muted-foreground uppercase tracking-widest">Available</div>
              <button
                onClick={fetchCoinBalances}
                disabled={coinBalancesLoading}
                className="text-muted-foreground hover:text-primary transition-colors p-1 rounded"
                title="Refresh live balance"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${coinBalancesLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
            <div className="font-mono font-black text-2xl sm:text-3xl text-primary">{formatCurrency(liveTotal)}</div>
            <div className="text-[9px] sm:text-[10px] text-muted-foreground/60 mt-1">Live · updates every 5s</div>
          </div>
          <div className="bg-secondary/40 rounded-lg sm:rounded-xl px-3 sm:px-4 py-2 sm:py-3 border border-border/30 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5 flex items-center gap-1.5">
                <Lock className="w-3 h-3" /> Vault
              </div>
              <div className="font-mono font-bold text-base sm:text-lg text-foreground">
                {vaultVisible ? formatCurrency(vaultBalance) : "••••••"}
              </div>
            </div>
            <button
              onClick={toggleVaultVisibility}
              className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-secondary"
              title={vaultVisible ? "Hide vault balance" : "Show vault balance"}
            >
              {vaultVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
          <Tabs defaultValue={defaultTab}>
            <TabsList className={`grid ${tabCols} w-full bg-secondary/60 h-9 sm:h-10 mb-4 sm:mb-6`}>
              {!isCreator && (
                <>
                  <TabsTrigger value="deposit" className="text-xs font-bold uppercase">
                    <ArrowDownToLine className="w-3 sm:w-3.5 h-3 sm:h-3.5 mr-1"/>Deposit
                  </TabsTrigger>
                  <TabsTrigger value="withdraw" className="text-xs font-bold uppercase">
                    <ArrowUpFromLine className="w-3 sm:w-3.5 h-3 sm:h-3.5 mr-1"/>Withdraw
                  </TabsTrigger>
                  <TabsTrigger value="tip" className="text-xs font-bold uppercase">
                    <Send className="w-3 sm:w-3.5 h-3 sm:h-3.5 mr-1"/>Tip
                  </TabsTrigger>
                </>
              )}
              <TabsTrigger value="vault" className="text-xs font-bold uppercase">
                <Lock className="w-3 sm:w-3.5 h-3 sm:h-3.5 mr-1"/>Vault
              </TabsTrigger>
            </TabsList>

            {/* ── DEPOSIT ─────────────────────────────────────────── */}
            {!isCreator && (
            <TabsContent value="deposit" className="space-y-5 mt-0">
              <div className="flex gap-2 flex-wrap">
                {CURRENCIES.map(c => (
                  <button
                    key={c.value}
                    onClick={() => { setCurrency(c.value); setDepositResult(null); setPaymentUrl(null); }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      currency === c.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/50 bg-secondary/40 text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <CoinIcon currency={c.value} size={16} />
                    <span>{c.network ? `USDT` : c.value.split("_")[0]}</span>
                    {c.network && <span className="text-[9px] px-1 py-0.5 rounded bg-black/20 text-muted-foreground font-bold">{c.network}</span>}
                  </button>
                ))}
              </div>

              {!depositResult ? (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider font-bold">Amount (USD)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                      <Input type="text" inputMode="decimal" value={amount === 0 ? "" : String(amount)}
                      onChange={e => {
                        const v = e.target.value.replace(/[^0-9.]/g, "");
                        if (v === "" || v === ".") setAmount(0);
                        else { const n = parseFloat(v); if (!isNaN(n)) setAmount(n); }
                      }}
                      onBlur={() => { if (!amount || amount < 1) setAmount(1); }}
                      placeholder="50"
                      className="pl-8 font-mono bg-secondary"/>
                    </div>
                    <div className="flex gap-2">
                      {[10,25,50,100,500].map(v => (
                        <button key={v} onClick={() => setAmount(v)} className="flex-1 text-xs py-1 rounded bg-secondary/80 hover:bg-secondary border border-border/50 hover:border-primary/40 transition-colors font-mono">
                          ${v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button className="w-full font-bold uppercase tracking-widest h-11" onClick={handleDeposit} disabled={initiateDeposit.isPending}>
                    {initiateDeposit.isPending ? "Generating Address..." : `Generate ${selectedCurrency.value} Deposit Address`}
                  </Button>
                </>
              ) : (
                <div className="space-y-4 py-2">
                  <div className="text-center">
                    <h3 className="font-black text-lg uppercase tracking-wider mb-1">Send Payment</h3>
                    <p className="text-xs text-muted-foreground">Send <span className="text-primary font-bold">{formatCurrency(amount)}</span> worth of <span className="text-primary font-bold">{selectedCurrency.name}</span> to this address.</p>
                  </div>
                  {depositResult.qrCode && (
                    <div className="flex justify-center">
                      <img src={depositResult.qrCode} alt="QR Code" className="w-40 h-40 rounded-lg border border-border bg-white p-1" />
                    </div>
                  )}
                  <div className="bg-secondary/60 rounded-xl p-3 border border-border/50 space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Deposit Address</p>
                    <p className="font-mono text-xs break-all text-foreground">{depositResult.address}</p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(depositResult.address); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      className="w-full text-xs py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary font-bold hover:bg-primary/20 transition-colors"
                    >
                      {copied ? "✓ Copied!" : "Copy Address"}
                    </button>
                  </div>
                  {depositStatus === "completed" && depositCredited ? (
                    <div className="bg-emerald-500/15 border border-emerald-500/40 rounded-lg p-4 text-center">
                      <div className="text-emerald-400 text-lg font-black mb-1">✓ Payment Received!</div>
                      <p className="text-xs text-muted-foreground">
                        <span className="text-emerald-300 font-mono font-bold">{depositCredited.amount} {depositCredited.currency}</span> has been credited to your balance.
                      </p>
                      <div className="mt-2 text-xs font-mono font-bold text-primary">{formatCurrency(liveTotal)}</div>
                      <div className="text-[10px] text-muted-foreground">New live balance</div>
                    </div>
                  ) : (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                        <p className="text-yellow-400 text-xs font-bold uppercase">Waiting for Payment</p>
                      </div>
                      <p className="text-xs text-muted-foreground">Send <span className="font-bold">{selectedCurrency.name}</span> only. Wrong coin = permanent loss. Balance updates automatically the moment payment confirms.</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => window.open(depositResult.paymentUrl, "_blank")}>
                      <ExternalLink className="w-3 h-3 mr-1" />View Invoice
                    </Button>
                    <Button size="sm" className="flex-1 text-xs" onClick={() => { setDepositResult(null); setPaymentUrl(null); setDepositStatus(null); setDepositCredited(null); }}>New Deposit</Button>
                  </div>
                </div>
              )}
            </TabsContent>
            )}

            {/* ── WITHDRAW ────────────────────────────────────────── */}
            {!isCreator && (
            <TabsContent value="withdraw" className="space-y-4 mt-0">
              <WithdrawPolicyNotice compact />

              {!hasCryptoBalances && !coinBalancesLoading && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-muted-foreground">
                  Deposit crypto first to enable withdrawals. Payouts return in the <strong className="text-foreground">same coin you deposited</strong>.
                </div>
              )}

              {/* Live balance summary */}
              <div className="bg-secondary/40 rounded-lg p-3 border border-border/40 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-bold uppercase tracking-wider">Live Total Balance</span>
                  <span className="text-primary font-mono font-black">{formatCurrency(liveTotal)}</span>
                </div>
                {coinBalancesLoading && (
                  <div className="text-xs text-muted-foreground animate-pulse">Fetching live prices…</div>
                )}
                {!coinBalancesLoading && Object.keys(coinData.cryptoAmounts).length > 0 && (
                  <div className="space-y-0.5 mt-1">
                    {Object.entries(coinData.cryptoAmounts).map(([coin, info]) => (
                      info.usdValue > 0 && (
                        <div key={coin} className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CoinIcon currency={coin} size={12} />
                            {coin.split("_")[0]}
                          </span>
                          <span className="font-mono">
                            {info.amount.toFixed(8)} ≈ <span className="text-foreground">{formatCurrency(info.usdValue)}</span>
                          </span>
                        </div>
                      )
                    ))}
                    {coinData.staticBalance > 0 && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>USD Balance</span>
                        <span className="font-mono text-foreground">{formatCurrency(coinData.staticBalance)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Coin selector */}
              <div className="flex gap-2 flex-wrap">
                {withdrawableCurrencies.map(c => {
                  const liveUsd = coinData.balances[c.value] ?? 0;
                  const isAvailable = liveUsd > 0;
                  return (
                    <button key={c.value}
                      disabled={!isAvailable || coinBalancesLoading}
                      onClick={() => { if (isAvailable) setWithdrawCurrency(c.value); }}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        !isAvailable
                          ? "border-border/20 bg-secondary/20 text-muted-foreground/30 opacity-40 cursor-not-allowed"
                          : withdrawCurrency === c.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/50 bg-secondary/40 text-muted-foreground hover:border-primary/40"
                      }`}
                      title={
                        isAvailable
                          ? hasCryptoBalances
                            ? `Live balance: ${formatCurrency(liveUsd)}`
                            : `Available: ${formatCurrency(liveTotal)}`
                          : "No balance in this coin"
                      }
                    >
                      <CoinIcon currency={c.value} size={16} />
                      <span>{c.network ? `USDT` : c.value.split("_")[0]}</span>
                      {c.network && <span className="text-[9px] px-1 py-0.5 rounded bg-black/20 text-muted-foreground font-bold">{c.network}</span>}
                      {c.network && <span className="text-[9px] px-1 py-0.5 rounded bg-black/20 text-muted-foreground">{c.network}</span>}
                    </button>
                  );
                })}
              </div>

              {/* Max for selected coin */}
              {hasBalance && maxWithdrawForCoin > 0 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                  <span>Max for {withdrawCurrency.split("_")[0]}:</span>
                  <div className="text-right">
                    <span className="text-primary font-bold font-mono">{formatCurrency(maxWithdrawForCoin)}</span>
                    {hasCryptoBalances && coinData.cryptoAmounts[withdrawCurrency] && (
                      <div className="text-muted-foreground/70 text-[10px]">
                        {coinData.cryptoAmounts[withdrawCurrency].amount.toFixed(8)} {withdrawCurrency.split("_")[0]}
                        {" @ "}{formatCurrency(coinData.cryptoAmounts[withdrawCurrency].price)}/coin
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wider font-bold">Amount (USD)</Label>
                  {maxWithdrawForCoin > 0 && (
                    <button
                      onClick={() => setWithdrawAmount(Math.floor(maxWithdrawForCoin * 100) / 100)}
                      className="text-xs text-primary font-bold hover:underline"
                    >
                      MAX
                    </button>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                  <Input type="text" inputMode="decimal" value={withdrawAmount === 0 ? "" : String(withdrawAmount)}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9.]/g, "");
                    if (v === "" || v === ".") setWithdrawAmount(0);
                    else { const n = parseFloat(v); if (!isNaN(n)) setWithdrawAmount(n); }
                  }}
                  onBlur={() => { if (!withdrawAmount || withdrawAmount < 1) setWithdrawAmount(1); }}
                  placeholder="50"
                  className={`pl-8 font-mono bg-secondary ${withdrawAmount > maxWithdrawForCoin && maxWithdrawForCoin > 0 ? "border-red-500/60" : ""}`}/>
                </div>
                {withdrawAmount > liveTotal && liveTotal > 0 && (
                  <p className="text-xs text-red-400">Exceeds your total live balance of {formatCurrency(liveTotal)}</p>
                )}
                {hasCryptoBalances && withdrawAmount > coinLiveUsd && coinLiveUsd > 0 && withdrawAmount <= liveTotal && (
                  <p className="text-xs text-red-400">Exceeds your {withdrawCurrency.split("_")[0]} balance of {formatCurrency(coinLiveUsd)}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider font-bold">Wallet Address</Label>
                <Input placeholder={`Your ${withdrawCurrency} address…`} value={withdrawAddress} onChange={e => setWithdrawAddress(e.target.value)} className="font-mono text-sm bg-secondary"/>
              </div>

              <div className="bg-secondary/40 rounded-lg p-3 text-xs text-muted-foreground border border-border/40">
                Available: <span className="text-foreground font-mono font-bold">{formatCurrency(liveTotal)}</span>
                {" · "}Min: <span className="text-foreground font-mono">$1.00</span>
                {maxWithdrawForCoin > 0 && <>{" · "}Max this coin: <span className="text-primary font-mono font-bold">{formatCurrency(maxWithdrawForCoin)}</span></>}
              </div>

              <Button
                className="w-full font-bold uppercase tracking-widest h-11"
                onClick={handleWithdraw}
                disabled={
                  requestWithdrawal.isPending ||
                  !isWagerMet ||
                  withdrawableCurrencies.length === 0 ||
                  withdrawAmount < 1 ||
                  !hasBalance ||
                  withdrawAmount > liveTotal ||
                  (hasCryptoBalances && withdrawAmount > coinLiveUsd && coinLiveUsd > 0) ||
                  coinBalancesLoading
                }
              >
                {requestWithdrawal.isPending
                  ? "Processing…"
                  : !isWagerMet
                    ? "Playthrough required"
                    : withdrawAmount >= 10000
                    ? "Request Withdrawal"
                    : "Instant Withdrawal"}
              </Button>
            </TabsContent>
            )}

            {/* ── TIP ─────────────────────────────────────────────── */}
            {!isCreator && (
            <TabsContent value="tip" className="space-y-4 mt-0">
              <p className="text-sm text-muted-foreground">Send a tip to any player on DGC Arcade.</p>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider font-bold">Username</Label>
                <Input placeholder="Player username…" value={tipUsername} onChange={e => setTipUsername(e.target.value)} className="bg-secondary"/>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider font-bold">Amount</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                  <Input type="text" inputMode="decimal"
                    value={tipAmount === 0 ? "" : String(tipAmount)}
                    onChange={e => {
                      const v = e.target.value.replace(/[^0-9.]/g, "");
                      if (v === "" || v === ".") setTipAmount(0);
                      else { const n = parseFloat(v); if (!isNaN(n)) setTipAmount(n); }
                    }}
                    onBlur={() => { if (!tipAmount || tipAmount < 1) setTipAmount(1); }}
                    placeholder="5"
                    className="pl-8 font-mono bg-secondary"/>
                </div>
                <div className="flex gap-2">
                  {[1,5,10,25].map(v => (
                    <button key={v} onClick={() => setTipAmount(v)} className="flex-1 text-xs py-1 rounded bg-secondary/80 hover:bg-secondary border border-border/50 transition-colors font-mono">${v}</button>
                  ))}
                </div>
              </div>
              <Button className="w-full font-bold uppercase tracking-widest h-11" onClick={handleTip} disabled={!tipUsername || tipAmount <= 0}>
                <Send className="w-4 h-4 mr-2" />Send Tip
              </Button>
            </TabsContent>
            )}

            {/* ── VAULT ───────────────────────────────────────────── */}
            <TabsContent value="vault" className="space-y-4 mt-0">
              <div className="bg-secondary/40 rounded-xl p-4 border border-border/40 text-center space-y-1">
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground uppercase tracking-widest font-bold">
                  <Lock className="w-3.5 h-3.5" /> Vault Balance
                </div>
                <div className="font-mono font-black text-3xl text-foreground">
                  {vaultVisible ? formatCurrency(vaultBalance) : "••••••"}
                </div>
                <p className="text-xs text-muted-foreground">Funds locked until you enter your password to release.</p>
              </div>

              {!vaultShowWithdraw ? (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider font-bold">Lock Amount (USD)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                      <Input type="text" inputMode="decimal"
                        value={vaultDepositAmt === 0 ? "" : String(vaultDepositAmt)}
                        onChange={e => {
                          const v = e.target.value.replace(/[^0-9.]/g, "");
                          if (v === "" || v === ".") setVaultDepositAmt(0);
                          else { const n = parseFloat(v); if (!isNaN(n)) setVaultDepositAmt(n); }
                        }}
                        onBlur={() => { if (!vaultDepositAmt || vaultDepositAmt < 1) setVaultDepositAmt(1); }}
                        placeholder="10"
                        className="pl-8 font-mono bg-secondary"
                      />
                    </div>
                    <div className="flex gap-2">
                      {[5,10,25,50,100].map(v => (
                        <button key={v} onClick={() => setVaultDepositAmt(v)} className="flex-1 text-xs py-1 rounded bg-secondary/80 hover:bg-secondary border border-border/50 hover:border-primary/40 transition-colors font-mono">${v}</button>
                      ))}
                    </div>
                  </div>

                  <Button
                    className="w-full font-bold uppercase tracking-widest h-11"
                    onClick={handleVaultDeposit}
                    disabled={vaultLoading || vaultDepositAmt <= 0 || vaultDepositAmt > liveTotal}
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    {vaultLoading ? "Locking…" : "Lock in Vault"}
                  </Button>

                  {vaultBalance > 0 && (
                    <button
                      onClick={() => setVaultShowWithdraw(true)}
                      className="w-full text-xs py-2.5 rounded-xl border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors font-bold uppercase tracking-wider flex items-center justify-center gap-2"
                    >
                      <Unlock className="w-3.5 h-3.5" /> Release from Vault
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider font-bold">Release Amount (USD)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                      <Input type="text" inputMode="decimal"
                        value={vaultWithdrawAmt === 0 ? "" : String(vaultWithdrawAmt)}
                        onChange={e => {
                          const v = e.target.value.replace(/[^0-9.]/g, "");
                          if (v === "" || v === ".") setVaultWithdrawAmt(0);
                          else { const n = parseFloat(v); if (!isNaN(n)) setVaultWithdrawAmt(n); }
                        }}
                        onBlur={() => { if (!vaultWithdrawAmt || vaultWithdrawAmt < 1) setVaultWithdrawAmt(1); }}
                        placeholder="10"
                        className="pl-8 font-mono bg-secondary"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider font-bold">Account Password</Label>
                    <Input
                      type="password"
                      placeholder="Your account password…"
                      value={vaultPassword}
                      onChange={e => setVaultPassword(e.target.value)}
                      className="bg-secondary"
                    />
                    <p className="text-xs text-muted-foreground">Your password is required to release locked funds.</p>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 font-bold uppercase" onClick={() => { setVaultShowWithdraw(false); setVaultPassword(""); }}>
                      Cancel
                    </Button>
                    <Button
                      className="flex-1 font-bold uppercase tracking-widest"
                      onClick={handleVaultWithdraw}
                      disabled={vaultLoading || vaultWithdrawAmt <= 0 || !vaultPassword || vaultWithdrawAmt > vaultBalance}
                    >
                      <Unlock className="w-4 h-4 mr-2" />
                      {vaultLoading ? "Releasing…" : "Release Funds"}
                    </Button>
                  </div>
                </>
              )}

              <div className="bg-secondary/30 rounded-lg p-3 border border-border/30">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-bold text-foreground">How it works:</span> Move funds into the Vault to lock them from being wagered. To release, enter your account password. Use this to protect your winnings.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
