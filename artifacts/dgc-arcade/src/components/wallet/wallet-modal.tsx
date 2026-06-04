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

function QRCodePlaceholder({ value }: { value: string }) {
  const size = 120;
  const cells = 10;
  const cell = size / cells;
  const hash = value.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rounded border border-border">
      <rect width={size} height={size} fill="white" />
      {Array.from({ length: cells }, (_, r) =>
        Array.from({ length: cells }, (_, c) => {
          const val = (hash * (r * cells + c + 1) * 2654435761) >>> 0;
          const on = val % 3 === 0 || (r < 3 && c < 3) || (r < 3 && c > cells - 4) || (r > cells - 4 && c < 3);
          return on ? <rect key={`${r}${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill="#111" /> : null;
        })
      )}
      {/* Corner squares */}
      {[[0,0],[0,7],[7,0]].map(([r,c],i) => (
        <g key={i}>
          <rect x={c*cell} y={r*cell} width={3*cell} height={3*cell} fill="#111"/>
          <rect x={c*cell+cell*0.5} y={r*cell+cell*0.5} width={2*cell} height={2*cell} fill="white"/>
          <rect x={c*cell+cell} y={r*cell+cell} width={cell} height={cell} fill="#111"/>
        </g>
      ))}
    </svg>
  );
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

  const selectedCurrency = CURRENCIES.find(c => c.value === currency) ?? CURRENCIES[0];
  const fakeAddress = `${currency.toLowerCase()}1${user?.username ?? "wallet"}qpxyz${currency.toLowerCase()}fake${amount}addr`;

  const handleDeposit = () => {
    initiateDeposit.mutate({ data: { amount, currency } }, {
      onSuccess: (res) => {
        setPaymentUrl(res.paymentUrl);
        window.open(res.paymentUrl, "_blank");
        toast({ title: "Deposit Initiated", description: "Complete payment in the new window." });
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
      <DialogContent className="max-w-md bg-card border-border/60 backdrop-blur-xl p-0 overflow-hidden">
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
                    onClick={() => setCurrency(c.value)}
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

              {!paymentUrl ? (
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

                  {/* QR / address preview */}
                  <div className="bg-secondary/40 rounded-xl p-4 border border-border/50 flex gap-4 items-center">
                    <QRCodePlaceholder value={fakeAddress} />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">Send {selectedCurrency.label}</div>
                      <div className="font-mono text-xs text-foreground break-all leading-relaxed">{fakeAddress}</div>
                      <button
                        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                        onClick={() => { navigator.clipboard.writeText(fakeAddress); toast({ title: "Address copied!" }); }}
                      >
                        <Copy className="w-3 h-3" /> Copy address
                      </button>
                    </div>
                  </div>

                  <Button className="w-full font-bold uppercase tracking-widest h-11" onClick={handleDeposit} disabled={initiateDeposit.isPending}>
                    {initiateDeposit.isPending ? "Generating..." : `Deposit ${selectedCurrency.value} via OxaPay`}
                  </Button>
                </>
              ) : (
                <div className="text-center space-y-4 py-4">
                  <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center mx-auto border border-primary">
                    <span className="text-2xl">✓</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Payment initiated. Complete it in the OxaPay window.</p>
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => window.open(paymentUrl, "_blank")}>
                      <ExternalLink className="w-4 h-4 mr-1.5" />Re-open
                    </Button>
                    <Button className="flex-1" onClick={() => setPaymentUrl(null)}>New Deposit</Button>
                  </div>
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
