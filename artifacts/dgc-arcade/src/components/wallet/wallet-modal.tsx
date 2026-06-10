import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useInitiateDeposit, useRequestWithdrawal, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { Copy, ExternalLink, QrCode, Send, ShoppingCart, Wallet, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

const CURRENCIES = [
  { value: "BTC",  label: "Bitcoin",  symbol: "₿", color: "#F7931A" },
  { value: "ETH",  label: "Ethereum", symbol: "Ξ", color: "#627EEA" },
  { value: "LTC",  label: "Litecoin", symbol: "Ł", color: "#A5A5A5" },
  { value: "USDT", label: "Tether",   symbol: "₮", color: "#26A17B" },
  { value: "DOGE", label: "Dogecoin", symbol: "Ð", color: "#C2A633" },
];

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

  const [currency, setCurrency] = useState("USDT");
  const [amount, setAmount] = useState(50);
  const [withdrawAmount, setWithdrawAmount] = useState(50);
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawCurrency, setWithdrawCurrency] = useState("USDT");
  const [tipUsername, setTipUsername] = useState("");
  const [tipAmount, setTipAmount] = useState(5);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [depositResult, setDepositResult] = useState<{address: string; qrCode: string; paymentUrl: string} | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedCurrency = CURRENCIES.find(c => c.value === currency) ?? CURRENCIES[0];


  const handleDeposit = () => {
    initiateDeposit.mutate({ data: { amount, currency } } as any, {
      onSuccess: (res: any) => {
        setDepositResult({ address: res.address, qrCode: res.qrCode, paymentUrl: res.paymentUrl });
        setPaymentUrl(res.paymentUrl);
        setTimeout(() => { window.location.href = res.paymentUrl; }, 1200);
        toast({ title: "Invoice Created", description: "Redirecting to payment page..." });
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
            <TabsList className="grid grid-cols-4 w-full bg-secondary/60 h-10 mb-6">
              <TabsTrigger value="deposit" className="text-xs font-bold uppercase">
                <ArrowDownToLine className="w-3.5 h-3.5 mr-1"/>Deposit
              </TabsTrigger>
              <TabsTrigger value="withdraw" className="text-xs font-bold uppercase">
                <ArrowUpFromLine className="w-3.5 h-3.5 mr-1"/>Withdraw
              </TabsTrigger>
              <TabsTrigger value="buy" className="text-xs font-bold uppercase">
                <ShoppingCart className="w-3.5 h-3.5 mr-1"/>Buy
              </TabsTrigger>
              <TabsTrigger value="tip" className="text-xs font-bold uppercase">
                <Send className="w-3.5 h-3.5 mr-1"/>Tip
              </TabsTrigger>
            </TabsList>

            {/* ── DEPOSIT ─────────────────────────────────────── */}
            <TabsContent value="deposit" className="space-y-5 mt-0">
              {/* Currency selector */}
              <div className="flex gap-2 flex-wrap">
                {CURRENCIES.map(c => (
                  <button
                    key={c.value}
                    onClick={() => { setCurrency(c.value); setDepositResult(null); setPaymentUrl(null); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      currency === c.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/50 bg-secondary/40 text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <span style={{ color: c.color }}>{c.symbol}</span>
                    {c.value}
                  </button>
                ))}
              </div>

              {!depositResult ? (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider font-bold">Amount (USD)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                      <Input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} className="pl-8 font-mono bg-secondary" min={1}/>
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
                <div className="space-y-4 text-center py-2">
                  <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500/50 flex items-center justify-center mx-auto">
                    <span className="text-3xl">✓</span>
                  </div>
                  <div>
                    <h3 className="font-black text-lg uppercase tracking-wider mb-1">Invoice Created</h3>
                    <p className="text-sm text-muted-foreground">Your payment page has opened in a new tab. Complete your deposit there.</p>
                  </div>
                  <div className="bg-secondary/40 rounded-xl p-4 border border-border/50 text-left space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-bold font-mono text-primary">{formatCurrency(amount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Currency</span>
                      <span className="font-bold">{selectedCurrency.label}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <span className="font-bold text-yellow-400">Awaiting Payment</span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => window.open(depositResult.paymentUrl, "_blank")}>
                      <ExternalLink className="w-4 h-4 mr-1.5" />Reopen Payment Page
                    </Button>
                    <Button className="flex-1" onClick={() => { setDepositResult(null); setPaymentUrl(null); }}>New Deposit</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Your balance will update automatically once payment is confirmed on the blockchain.</p>
                </div>
              )}
            </TabsContent>

            {/* ── WITHDRAW ────────────────────────────────────── */}
            <TabsContent value="withdraw" className="space-y-4 mt-0">
              <div className="flex gap-2 flex-wrap">
                {CURRENCIES.map(c => (
                  <button key={c.value} onClick={() => setWithdrawCurrency(c.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      withdrawCurrency === c.value ? "border-primary bg-primary/10 text-primary" : "border-border/50 bg-secondary/40 text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <span style={{ color: c.color }}>{c.symbol}</span>{c.value}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider font-bold">Amount (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                  <Input type="number" value={withdrawAmount} onChange={e => setWithdrawAmount(Number(e.target.value))} className="pl-8 font-mono bg-secondary" min={1}/>
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
            </TabsContent>

            {/* ── BUY CRYPTO ──────────────────────────────────── */}
            <TabsContent value="buy" className="mt-0 space-y-3">
              <p className="text-sm text-muted-foreground">Purchase crypto directly with your card. Opens an external exchange.</p>
              {[
                { name: "MoonPay", desc: "Card & bank transfer", url: "https://www.moonpay.com", color: "#7D5AF0" },
                { name: "Simplex", desc: "Fast credit card", url: "https://www.simplex.com", color: "#0075FF" },
                { name: "Coinbase", desc: "Buy with bank", url: "https://www.coinbase.com", color: "#0052FF" },
              ].map(e => (
                <a key={e.name} href={e.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-secondary/40 hover:border-primary/40 hover:bg-secondary/70 transition-all group"
                >
                  <div>
                    <div className="font-bold text-sm" style={{ color: e.color }}>{e.name}</div>
                    <div className="text-xs text-muted-foreground">{e.desc}</div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </a>
              ))}
            </TabsContent>

            {/* ── TIP ─────────────────────────────────────────── */}
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
                  <Input type="number" value={tipAmount} onChange={e => setTipAmount(Number(e.target.value))} className="pl-8 font-mono bg-secondary" min={1}/>
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
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
