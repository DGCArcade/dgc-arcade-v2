import { useState } from "react";
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
import { ExternalLink, Send, Wallet, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { CoinIcon, CURRENCIES } from "./coin-icon";

interface WalletModalProps {
  open: boolean;
  onClose: () => void;
}

export function WalletModal({ open, onClose }: WalletModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initiateDeposit = useInitiateDeposit();
  const requestWithdrawal = useRequestWithdrawal();

  const [currency, setCurrency] = useState("BTC");
  const [amount, setAmount] = useState(50);
  const [withdrawAmount, setWithdrawAmount] = useState(50);
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawCurrency, setWithdrawCurrency] = useState("BTC");
  const [tipUsername, setTipUsername] = useState("");
  const [tipAmount, setTipAmount] = useState(5);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [depositResult, setDepositResult] = useState<{address: string; qrCode: string; paymentUrl: string} | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedCurrency = CURRENCIES.find(c => c.value === currency) ?? CURRENCIES[0];
  // Creator / tester accounts have withdrawals disabled — they only see Deposit + Withdraw.
  const isCreator = user?.withdrawalsEnabled === false;

  const handleDeposit = () => {
    initiateDeposit.mutate({ data: { amount, currency } } as any, {
      onSuccess: (res: any) => {
        setDepositResult({ address: res.address, qrCode: res.qrCode, paymentUrl: res.paymentUrl });
        setPaymentUrl(res.paymentUrl);
        // White-label: show address on-page. Only open Plisio if no address returned
        if (!res?.address && res?.paymentUrl) {
          window.open(res.paymentUrl, "_blank", "noopener,noreferrer");
        }
        toast({ title: "Deposit Address Ready", description: "Send crypto to the address shown. Balance updates automatically." });
      },
      onError: (err: unknown) => {
        const msg = (err as {data?: {error?: string}})?.data?.error ?? "Error";
        toast({ title: "Deposit Failed", description: msg, variant: "destructive" });
      }
    });
  };

  const handleWithdraw = () => {
    if (!withdrawAddress) { toast({ title: "Address required", variant: "destructive" }); return; }
    requestWithdrawal.mutate({ data: { amount: withdrawAmount, currency: withdrawCurrency, address: withdrawAddress } }, {
      onSuccess: () => {
        toast({ title: "Withdrawal Requested", description: "Pending admin approval." });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setWithdrawAddress("");
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
    const res = await fetch("/api/admin/tip", {
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-card border-border/60 backdrop-blur-xl p-0 overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="p-6 pb-0 border-b border-border/40">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display font-black text-xl uppercase tracking-widest">
              <Wallet className="w-5 h-5 text-primary" />
              Wallet
            </DialogTitle>
          </DialogHeader>
          {/* Balance */}
          <div className="mt-4 mb-4 bg-secondary/60 rounded-xl p-4 border border-primary/20">
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Available Balance</div>
            <div className="font-mono font-black text-3xl text-primary">{formatCurrency(user?.balance ?? 0)}</div>
          </div>
        </div>

        <div className="p-6">
          <Tabs defaultValue="deposit">
            <TabsList className={`grid ${isCreator ? "grid-cols-2" : "grid-cols-3"} w-full bg-secondary/60 h-10 mb-6`}>
              <TabsTrigger value="deposit" className="text-xs font-bold uppercase">
                <ArrowDownToLine className="w-3.5 h-3.5 mr-1"/>Deposit
              </TabsTrigger>
              <TabsTrigger value="withdraw" className="text-xs font-bold uppercase">
                <ArrowUpFromLine className="w-3.5 h-3.5 mr-1"/>Withdraw
              </TabsTrigger>
              {!isCreator && (
                <TabsTrigger value="tip" className="text-xs font-bold uppercase">
                  <Send className="w-3.5 h-3.5 mr-1"/>Tip
                </TabsTrigger>
              )}
            </TabsList>

            {/* ── DEPOSIT ─────────────────────────────────────── */}
            <TabsContent value="deposit" className="space-y-5 mt-0">
              {/* Currency selector */}
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
                    <span>{c.name === "Tether USDT" ? "USDT" : c.value.split("_")[0]}</span>
                    {c.network && <span className="text-[9px] px-1 py-0.5 rounded bg-black/20 text-muted-foreground">{c.network}</span>}
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
                    <p className="font-mono text-xs break-all text-foreground leading-relaxed">{depositResult.address || "Address loading..."}</p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(depositResult.address); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      className="w-full text-xs py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary font-bold hover:bg-primary/20 transition-colors"
                    >
                      {copied ? "✓ Copied!" : "Copy Address"}
                    </button>
                  </div>
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                    <p className="text-yellow-400 text-xs font-bold uppercase mb-1">Important</p>
                    <p className="text-xs text-muted-foreground">Only send <span className="font-bold">{selectedCurrency.name}</span> to this address. Wrong coin = permanent loss.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => window.open(depositResult.paymentUrl, "_blank")}>
                      <ExternalLink className="w-3 h-3 mr-1" />View Invoice
                    </Button>
                    <Button size="sm" className="flex-1 text-xs" onClick={() => { setDepositResult(null); setPaymentUrl(null); }}>New Deposit</Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ── WITHDRAW ────────────────────────────────────── */}
            <TabsContent value="withdraw" className="space-y-4 mt-0">
              {isCreator ? (
                <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-6 text-center space-y-2">
                  <p className="font-display font-black uppercase tracking-widest text-yellow-400">Withdrawals Unavailable</p>
                  <p className="text-sm text-muted-foreground">Please contact DGC Arcade support to process a withdrawal for your account.</p>
                </div>
              ) : (
              <>
              <div className="flex gap-2 flex-wrap">
                {CURRENCIES.map(c => (
                  <button key={c.value} onClick={() => setWithdrawCurrency(c.value)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      withdrawCurrency === c.value ? "border-primary bg-primary/10 text-primary" : "border-border/50 bg-secondary/40 text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <CoinIcon currency={c.value} size={16} />
                    <span>{c.name === "Tether USDT" ? "USDT" : c.value.split("_")[0]}</span>
                    {c.network && <span className="text-[9px] px-1 py-0.5 rounded bg-black/20 text-muted-foreground">{c.network}</span>}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider font-bold">Amount (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                  <Input type="text" inputMode="decimal" value={withdrawAmount === 0 ? "" : String(withdrawAmount)}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9.]/g, "");
                    if (v === "" || v === ".") setWithdrawAmount(0);
                    else { const n = parseFloat(v); if (!isNaN(n)) setWithdrawAmount(n); }
                  }}
                  onBlur={() => { if (!withdrawAmount || withdrawAmount < 5) setWithdrawAmount(5); }}
                  placeholder="50"
                  className="pl-8 font-mono bg-secondary"/>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider font-bold">Wallet Address</Label>
                <Input placeholder={`Your ${withdrawCurrency} address…`} value={withdrawAddress} onChange={e => setWithdrawAddress(e.target.value)} className="font-mono text-sm bg-secondary"/>
              </div>

              <div className="bg-secondary/40 rounded-lg p-3 text-xs text-muted-foreground border border-border/40">
                Available: <span className="text-foreground font-mono font-bold">{formatCurrency(user?.balance ?? 0)}</span>
                {" · "}Min withdrawal: <span className="text-foreground font-mono">$5.00</span>
              </div>

              <Button
                className="w-full font-bold uppercase tracking-widest h-11"
                onClick={handleWithdraw}
                disabled={requestWithdrawal.isPending || withdrawAmount < 5}
              >
                {requestWithdrawal.isPending ? "Processing…" : "Request Withdrawal"}
              </Button>
              </>
              )}
            </TabsContent>

            {/* ── TIP ─────────────────────────────────────────── */}
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
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
