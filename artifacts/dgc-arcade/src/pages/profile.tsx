import { useAuth } from "@/hooks/use-auth";
import { useListTransactions, getListTransactionsQueryKey } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DepositForm } from "@/components/profile/deposit-form";
import { WithdrawForm } from "@/components/profile/withdraw-form";
import { useLocation } from "wouter";
import { ArrowDownLeft, ArrowUpRight, Clock, CheckCircle2, XCircle, Landmark, RefreshCw, Users, Copy, CheckCheck, TrendingUp, Shield, Save, MessageCircle, Zap, Lock, Monitor, Smartphone, Tablet, Globe, LogOut, X, ChevronRight } from "lucide-react";
import { CoinIcon } from "@/components/wallet/coin-icon";
import { useState, useEffect, useCallback } from "react";
import { VipModal, getVipProgress } from "@/components/vip/vip-modal";
import { OwnerAiChat } from "@/components/owner/owner-ai-chat";

export default function Profile() {
  const { user, isAuthenticated, isLoading, cryptoBalances } = useAuth();
  const [, setLocation] = useLocation();

  const { data: transactions } = useListTransactions({ limit: 50 }, {
    query: { queryKey: getListTransactionsQueryKey({ limit: 50 }), enabled: isAuthenticated }
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) setLocation("/");
  }, [isLoading, isAuthenticated, setLocation]);

  const [plisioBalances, setPlisioBalances] = useState<Record<string,string> | null>(null);
  const [plisioLoading, setPlisioLoading] = useState(false);
  const [plisioError, setPlisioError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [tipUsername, setTipUsername] = useState("");
  const [tipAmount, setTipAmount] = useState(5);
  const [tipLoading, setTipLoading] = useState(false);
  const [refData, setRefData] = useState<{ code: string; link: string; tier: string; color: string; emoji: string; commissionPct: number; activeReferrals: number; pendingReferrals: number; totalEarned: number } | null>(null);
  const [refCopied, setRefCopied] = useState(false);
  const [vipOpen, setVipOpen] = useState(false);
  const [telegramInput, setTelegramInput] = useState("");
  const [telegramSaving, setTelegramSaving] = useState(false);
  const [telegramMsg, setTelegramMsg] = useState<{ok: boolean; text: string} | null>(null);
  const [vaultBalance, setVaultBalance] = useState<number | null>(null);
  const [vaultDepositAmt, setVaultDepositAmt] = useState("");
  const [vaultWithdrawAmt, setVaultWithdrawAmt] = useState("");
  const [vaultPassword, setVaultPassword] = useState("");
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultMsg, setVaultMsg] = useState<{ok: boolean; text: string} | null>(null);
  // ── Device history modal ──
  const [deviceHistoryOpen, setDeviceHistoryOpen] = useState(false);
  const [deviceHistory, setDeviceHistory] = useState<any[]>([]);
  const [deviceHistoryLoading, setDeviceHistoryLoading] = useState(false);
  const [logoutAllLoading, setLogoutAllLoading] = useState(false);
  // ── View All Transactions modal ──
  const [txAllOpen, setTxAllOpen] = useState(false);
  const [txAll, setTxAll] = useState<any[]>([]);
  const [txAllLoading, setTxAllLoading] = useState(false);

  useEffect(() => { if (user) setTelegramInput((user as any).telegramUsername ?? ""); }, [user?.username]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const token = localStorage.getItem("dgc_token");
    fetch("/api/users/me/vault", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setVaultBalance(parseFloat(d.vaultBalance ?? "0"))).catch(() => {});
  }, [isAuthenticated]);

  const saveTelegram = async () => {
    setTelegramSaving(true); setTelegramMsg(null);
    try {
      const token = localStorage.getItem("dgc_token");
      const res = await fetch("/api/users/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ telegramUsername: telegramInput.replace(/^@/, "").trim() }),
      });
      const d = await res.json();
      if (!res.ok) { setTelegramMsg({ ok: false, text: d.error ?? "Save failed" }); return; }
      setTelegramMsg({ ok: true, text: "Saved!" });
    } catch { setTelegramMsg({ ok: false, text: "Network error" }); }
    finally { setTelegramSaving(false); }
  };

  const handleVaultDeposit = async () => {
    const amt = parseFloat(vaultDepositAmt);
    if (!amt || amt <= 0) return;
    setVaultLoading(true); setVaultMsg(null);
    try {
      const token = localStorage.getItem("dgc_token");
      const res = await fetch("/api/users/me/vault/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: amt }),
      });
      const d = await res.json();
      if (!res.ok) { setVaultMsg({ ok: false, text: d.error ?? "Failed" }); return; }
      setVaultBalance(d.vaultBalance); setVaultDepositAmt("");
      setVaultMsg({ ok: true, text: `Deposited ${formatCurrency(amt)} to vault` });
    } catch { setVaultMsg({ ok: false, text: "Network error" }); }
    finally { setVaultLoading(false); }
  };

  const handleVaultWithdraw = async () => {
    const amt = parseFloat(vaultWithdrawAmt);
    if (!amt || amt <= 0 || !vaultPassword) return;
    setVaultLoading(true); setVaultMsg(null);
    try {
      const token = localStorage.getItem("dgc_token");
      const res = await fetch("/api/users/me/vault/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: amt, password: vaultPassword }),
      });
      const d = await res.json();
      if (!res.ok) { setVaultMsg({ ok: false, text: d.error ?? "Failed" }); return; }
      setVaultBalance(d.vaultBalance); setVaultWithdrawAmt(""); setVaultPassword("");
      setVaultMsg({ ok: true, text: `Released ${formatCurrency(amt)} from vault` });
    } catch { setVaultMsg({ ok: false, text: "Network error" }); }
    finally { setVaultLoading(false); }
  };

  const handleProfileTip = async () => {
    if (!tipUsername.trim() || tipAmount <= 0) return;
    setTipLoading(true);
    try {
      const token = localStorage.getItem("dgc_token");
      await fetch("/api/admin/tip", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ toUsername: tipUsername.trim(), amount: tipAmount }),
      }).then(res => { if (res.ok) { setTipUsername(""); setTipAmount(5); } });
    } finally { setTipLoading(false); }
  };

  const fetchPlisioBalance = useCallback(async () => {
    if (user?.role !== "owner" && user?.role !== "admin") return;
    setPlisioLoading(true); setPlisioError(null);
    try {
      const token = localStorage.getItem("dgc_token");
      const apiUrl = (import.meta.env.VITE_API_URL ?? "") + "/api/users/owner/plisio-balance";
      const res = await fetch(apiUrl, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) { setPlisioError((data.error ?? "Failed to load")); return; }
      if (!data.balances || Object.keys(data.balances).length === 0) { setPlisioError("No balances returned."); return; }
      setPlisioBalances(data.balances); setLastRefresh(new Date());
    } catch (e: any) { setPlisioError("Network error: " + (e?.message ?? "unknown")); }
    finally { setPlisioLoading(false); }
  }, [user?.username]);

  useEffect(() => {
    if (user?.role === "owner" || user?.role === "admin") {
      fetchPlisioBalance();
      const interval = setInterval(fetchPlisioBalance, 30000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [user?.username, fetchPlisioBalance]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const token = localStorage.getItem('dgc_token');
    fetch('/api/referrals/my-code', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.code) setRefData(d); }).catch(() => {});
  }, [isAuthenticated]);

  const copyRefLink = async () => {
    if (!refData) return;
    await navigator.clipboard.writeText(refData.link);
    setRefCopied(true); setTimeout(() => setRefCopied(false), 2000);
  };

  const openDeviceHistory = async () => {
    setDeviceHistoryOpen(true);
    if (deviceHistory.length > 0) return;
    setDeviceHistoryLoading(true);
    try {
      const token = localStorage.getItem("dgc_token");
      const res = await fetch("/api/users/me/device-history", { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      setDeviceHistory(d.sessions ?? []);
    } catch { setDeviceHistory([]); }
    finally { setDeviceHistoryLoading(false); }
  };

  const handleLogoutAll = async () => {
    if (!confirm("Log out of all devices? You will need to sign back in.")) return;
    setLogoutAllLoading(true);
    try {
      const token = localStorage.getItem("dgc_token");
      await fetch("/api/users/me/logout-all-devices", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      localStorage.removeItem("dgc_token");
      setDeviceHistoryOpen(false);
      setLocation("/");
    } catch { setLogoutAllLoading(false); }
  };

  const openAllTransactions = async () => {
    setTxAllOpen(true);
    if (txAll.length > 0) return;
    setTxAllLoading(true);
    try {
      const token = localStorage.getItem("dgc_token");
      const res = await fetch("/api/transactions?limit=200", { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      setTxAll(Array.isArray(d) ? d : (d.transactions ?? []));
    } catch { setTxAll([]); }
    finally { setTxAllLoading(false); }
  };

  if (isLoading || !user) return <div className="animate-pulse bg-secondary h-96 rounded-xl border border-border" />;

  const wagered = (user as any)?.totalWageredAmount ?? 0;
  const rakebackClaimed = (user as any)?.rakebackClaimed ?? 0;
  const { tier: vipTier, next: vipNext, pct: vipPct } = getVipProgress(wagered);
  const claimableRakeback = Math.max(0, wagered * (vipTier.rakebackPct / 100) - rakebackClaimed);
  const lastLoginAt = (user as any)?.lastLoginAt;

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-destructive" />;
      case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'processing': return <Clock className="w-4 h-4 text-blue-400" />;
      case 'needs_review': return <Clock className="w-4 h-4 text-amber-400" />;
      default: return null;
    }
  };
  const statusLabel = (status: string) => {
    switch (status) {
      case 'needs_review': return 'Under review';
      case 'processing': return 'Processing';
      default: return status.replace(/_/g, ' ');
    }
  };

  const TxRow = ({ tx }: { tx: any }) => (
    <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-secondary/30 hover:bg-secondary/60 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-full ${tx.type === 'deposit' || tx.type === 'bet_win' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
          {tx.type === 'deposit' || tx.type === 'bet_win' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
        </div>
        <div>
          <p className="font-bold text-sm uppercase">{tx.type.replace('_', ' ')}</p>
          <p className="text-xs text-muted-foreground font-mono">{new Date(tx.createdAt).toLocaleString()}</p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={`font-mono font-bold ${tx.type === 'deposit' || tx.type === 'bet_win' ? 'text-green-500' : 'text-foreground'}`}>
          {tx.type === 'deposit' || tx.type === 'bet_win' ? '+' : '-'}{formatCurrency(tx.amount)}
        </span>
        <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
          {getStatusIcon(tx.status)}<span className="uppercase">{statusLabel(tx.status)}</span>
        </div>
      </div>
    </div>
  );

  const DeviceIcon = ({ type }: { type?: string }) => {
    if (type === "mobile") return <Smartphone className="w-4 h-4 text-muted-foreground" />;
    if (type === "tablet") return <Tablet className="w-4 h-4 text-muted-foreground" />;
    return <Monitor className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto w-full">
      {/* ── Device History Modal ── */}
      {deviceHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setDeviceHistoryOpen(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h2 className="font-display font-black uppercase tracking-widest text-lg">Login Sessions</h2>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">Devices that have accessed your account</p>
              </div>
              <button onClick={() => setDeviceHistoryOpen(false)} className="p-2 rounded-lg hover:bg-secondary transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {deviceHistoryLoading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <div key={i} className="h-16 bg-secondary/50 rounded-lg animate-pulse" />)}
                </div>
              ) : deviceHistory.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground font-mono text-sm">No session history yet.</div>
              ) : deviceHistory.map((s: any) => (
                <div key={s.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-secondary/30">
                  <div className="p-2 rounded-lg bg-secondary mt-0.5">
                    <DeviceIcon type={s.deviceType} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm">{s.deviceName ?? `${s.deviceOs ?? "Unknown OS"} · ${s.deviceBrowser ?? "Unknown Browser"}`}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {s.ip && <span className="text-xs text-muted-foreground font-mono">{s.ip}</span>}
                      {(s.country || s.city) && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Globe className="w-3 h-3" />{[s.city, s.country].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-3 mt-1">
                      <span className="text-[10px] text-muted-foreground font-mono">
                        Last: {new Date(s.lastSeen).toLocaleDateString()}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {s.loginCount ?? 1} login{(s.loginCount ?? 1) !== 1 ? "s" : ""}
                      </span>
                      {s.vpnDetected && <span className="text-[10px] text-amber-400 font-mono font-bold">VPN</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-border">
              <button
                onClick={handleLogoutAll}
                disabled={logoutAllLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors font-bold text-sm uppercase tracking-wider disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" />
                {logoutAllLoading ? "Logging out…" : "Log Out of All Devices"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View All Transactions Modal ── */}
      {txAllOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setTxAllOpen(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="font-display font-black uppercase tracking-widest text-lg">Full Transaction History</h2>
              <button onClick={() => setTxAllOpen(false)} className="p-2 rounded-lg hover:bg-secondary transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {txAllLoading ? (
                <div className="space-y-2">
                  {[...Array(8)].map((_,i) => <div key={i} className="h-14 bg-secondary/50 rounded-lg animate-pulse" />)}
                </div>
              ) : txAll.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground font-mono text-sm">No transactions found.</div>
              ) : txAll.map(tx => <TxRow key={tx.id} tx={tx} />)}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-border/50 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-secondary border-2 border-primary flex items-center justify-center font-display font-black text-3xl text-primary">
            {user.username.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="font-display font-black text-3xl uppercase tracking-widest">{user.username}</h1>
            <p className="text-muted-foreground font-mono text-sm">Joined {new Date(user.createdAt).toLocaleDateString()}</p>
            {lastLoginAt ? (
              <button
                onClick={openDeviceHistory}
                className="flex items-center gap-1 text-muted-foreground/70 hover:text-primary font-mono text-xs mt-0.5 transition-colors cursor-pointer group"
              >
                <Clock className="w-3 h-3 group-hover:text-primary transition-colors" />
                Last login: {new Date(lastLoginAt).toLocaleString()}
                <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ) : (
              <button onClick={openDeviceHistory} className="text-muted-foreground/50 font-mono text-xs mt-0.5 hover:text-primary transition-colors cursor-pointer">
                View login history
              </button>
            )}
            {/* Telegram field */}
            <div className="flex items-center gap-2 mt-2">
              <MessageCircle className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
              <input
                type="text" value={telegramInput}
                onChange={e => setTelegramInput(e.target.value)}
                placeholder="@telegram_username"
                autoComplete="off"
                name={`tg-${Math.random().toString(36).slice(2, 7)}`}
                className="bg-transparent border-b border-border/50 focus:border-sky-400 outline-none font-mono text-xs text-muted-foreground focus:text-foreground transition-colors w-36 pb-0.5"
              />
              <button onClick={saveTelegram} disabled={telegramSaving}
                className="p-1 rounded text-sky-400 hover:text-sky-300 transition-colors disabled:opacity-40" title="Save Telegram">
                <Save className="w-3 h-3" />
              </button>
              {telegramMsg && (
                <span className={`text-[10px] font-mono ${telegramMsg.ok ? "text-green-400" : "text-red-400"}`}>{telegramMsg.text}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="bg-secondary/50 border border-primary/20 rounded-xl p-4 flex flex-col items-end min-w-[200px]">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Live Balance</span>
            <span className="font-mono font-bold text-3xl text-primary">{formatCurrency(user.balance as number)}</span>
            {cryptoBalances.length > 0 && (
              <div className="mt-2 w-full space-y-1 border-t border-border/30 pt-2">
                {cryptoBalances.filter(cb => cb.amount > 0).map(cb => (
                  <div key={cb.currency} className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <CoinIcon currency={cb.currency} size={11} />
                      <span className="font-mono">{cb.amount.toFixed(6)} {cb.currency.split("_")[0]}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-foreground font-bold">{formatCurrency(cb.usdValue)}</div>
                      <div className="text-[9px] text-muted-foreground">@ ${cb.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="text-[9px] text-muted-foreground/60 mt-1">Updates every 5s · live market price</div>
          </div>
          {/* VIP badge — cursor-pointer so it's obviously clickable */}
          <button onClick={() => setVipOpen(true)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 border transition-all w-full justify-between cursor-pointer hover:brightness-125"
            style={{ borderColor: vipTier.color + "50", background: vipTier.color + "10" }}>
            <div className="flex items-center gap-2">
              <span className="text-lg">{vipTier.icon}</span>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: vipTier.color }}>{vipTier.name}</div>
                <div className="text-[9px] text-muted-foreground font-mono">{vipTier.rakebackPct}% rakeback</div>
              </div>
            </div>
            <div className="w-20">
              <div className="w-full h-1.5 rounded-full bg-black/30 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${vipPct}%`, backgroundColor: vipNext?.color ?? vipTier.color }} />
              </div>
              <div className="text-[9px] text-muted-foreground font-mono mt-0.5 text-right">{vipPct.toFixed(0)}%</div>
            </div>
          </button>
        </div>
      </div>

      {/* ── Main 2-column grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left col — DGC Bank only */}
        <div className="md:col-span-1">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-display uppercase tracking-widest text-lg flex items-center gap-2"><span className="text-glow-shift">DGC Bank · Wallet</span></CardTitle>
            </CardHeader>
            <CardContent>
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
                      <input type="text" value={tipUsername} onChange={e => setTipUsername(e.target.value)} placeholder="username"
                        className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm font-mono" />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground block mb-1">Amount (USD)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">$</span>
                        <input type="number" min={1} value={tipAmount} onChange={e => setTipAmount(Number(e.target.value))}
                          className="w-full rounded-md border border-border bg-secondary pl-8 pr-3 py-2 text-sm font-mono" />
                      </div>
                      <div className="flex gap-1 mt-2">
                        {[1,5,10,25,50].map(v => (
                          <button key={v} type="button" onClick={() => setTipAmount(v)}
                            className="flex-1 text-xs py-1 rounded bg-secondary border border-border font-mono hover:border-primary/40 transition-colors">
                            ${v}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button onClick={handleProfileTip} disabled={tipLoading || !tipUsername.trim() || tipAmount <= 0}
                      className="w-full h-10 rounded-md bg-primary text-primary-foreground font-bold uppercase tracking-widest text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors">
                      {tipLoading ? "Sending…" : `Send ${formatCurrency(tipAmount)} Tip`}
                    </button>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Right col — Transaction History + Vault + Stats stacked */}
        <div className="md:col-span-2 space-y-6">
          {/* Transaction History */}
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="font-display uppercase tracking-widest text-lg">Transaction History</CardTitle>
              <button
                onClick={openAllTransactions}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                View All <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </CardHeader>
            <CardContent>
              {!transactions?.length ? (
                <div className="text-center py-10 text-muted-foreground font-mono text-sm border border-dashed border-border rounded-lg bg-secondary/20">
                  No transactions found.
                </div>
              ) : (
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 rounded-lg border border-primary/10 shadow-[0_0_24px_var(--theme-glow)] p-1">
                  {transactions.map(tx => <TxRow key={tx.id} tx={tx} />)}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Vault */}
          <Card className="bg-card border-border border-cyan-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="font-display uppercase tracking-widest text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-cyan-400" />
                <span className="text-cyan-400">Vault</span>
                {vaultBalance !== null && (
                  <span className="ml-auto font-mono font-black text-base text-cyan-400">{formatCurrency(vaultBalance)}</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">Lock funds for safekeeping. Withdrawal requires your account password.</p>
              <Tabs defaultValue="deposit" className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-secondary mb-3">
                  <TabsTrigger value="deposit" className="font-bold uppercase text-xs">Deposit</TabsTrigger>
                  <TabsTrigger value="withdraw" className="font-bold uppercase text-xs">Withdraw</TabsTrigger>
                </TabsList>
                <TabsContent value="deposit" className="space-y-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">$</span>
                    <input type="number" min={0.01} step={0.01} value={vaultDepositAmt}
                      onChange={e => setVaultDepositAmt(e.target.value)} placeholder="0.00"
                      className="w-full rounded-md border border-border bg-secondary pl-8 pr-3 py-2 text-sm font-mono" />
                  </div>
                  <button onClick={handleVaultDeposit} disabled={vaultLoading || !vaultDepositAmt}
                    className="w-full h-9 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white font-bold uppercase tracking-widest text-xs disabled:opacity-50 transition-colors">
                    {vaultLoading ? "…" : "Lock in Vault"}
                  </button>
                </TabsContent>
                <TabsContent value="withdraw" className="space-y-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">$</span>
                    <input type="number" min={0.01} step={0.01} value={vaultWithdrawAmt}
                      onChange={e => setVaultWithdrawAmt(e.target.value)} placeholder="0.00"
                      className="w-full rounded-md border border-border bg-secondary pl-8 pr-3 py-2 text-sm font-mono" />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input type="password" value={vaultPassword} onChange={e => setVaultPassword(e.target.value)}
                      placeholder="Account password"
                      className="w-full rounded-md border border-border bg-secondary pl-9 pr-3 py-2 text-sm font-mono" />
                  </div>
                  <button onClick={handleVaultWithdraw} disabled={vaultLoading || !vaultWithdrawAmt || !vaultPassword}
                    className="w-full h-9 rounded-md bg-secondary border border-cyan-500/40 text-cyan-400 font-bold uppercase tracking-widest text-xs disabled:opacity-50 hover:border-cyan-500 transition-colors">
                    {vaultLoading ? "…" : "Release from Vault"}
                  </button>
                </TabsContent>
              </Tabs>
              {vaultMsg && (
                <p className={`text-xs font-mono ${vaultMsg.ok ? "text-green-400" : "text-red-400"}`}>{vaultMsg.text}</p>
              )}
            </CardContent>
          </Card>

          {/* Stats */}
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="font-display uppercase tracking-widest text-lg">Stats</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground text-sm font-medium">Total Bets</span>
                <span className="font-mono font-bold">{user.totalBets || 0}</span>
              </div>
              <div className="flex justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground text-sm font-medium">Total Won</span>
                <span className="font-mono font-bold text-primary">{formatCurrency(user.totalWon || 0)}</span>
              </div>
              <div className="flex justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground text-sm font-medium">Total Wagered</span>
                <span className="font-mono font-bold">{formatCurrency(wagered)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm font-medium flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-primary" /> Rakeback
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-primary">{formatCurrency(claimableRakeback)}</span>
                  {claimableRakeback >= 0.01 && (
                    <button onClick={() => setVipOpen(true)}
                      className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold uppercase hover:bg-primary/30 transition-colors">
                      Claim
                    </button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Referral Program Widget */}
      {refData && (
        <div className="rounded-2xl border overflow-hidden relative"
          style={{ borderColor: refData.color + "30", background: `linear-gradient(135deg, ${refData.color}08 0%, transparent 60%)` }}>
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: `radial-gradient(circle, ${refData.color} 1px, transparent 1px)`, backgroundSize: "28px 28px" }} />
          <div className="relative p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="font-display font-black uppercase tracking-widest text-sm">Referral Program</span>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-widest border px-2.5 py-0.5 text-xs"
                style={{ borderColor: refData.color + "60", color: refData.color, backgroundColor: refData.color + "18" }}>
                {refData.emoji} {refData.tier}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-border/40 bg-background/40 backdrop-blur-sm p-3 text-center">
                <div className="font-mono font-black text-xl text-green-400">{refData.activeReferrals}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5 font-bold">Active</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-background/40 backdrop-blur-sm p-3 text-center">
                <div className="font-mono font-black text-xl text-yellow-400">{refData.pendingReferrals}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5 font-bold">Pending</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-background/40 backdrop-blur-sm p-3 text-center">
                <div className="font-mono font-black text-xl" style={{ color: refData.color }}>{refData.commissionPct}%</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5 font-bold">Commission</div>
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5">Your Referral Link</div>
              <div className="flex gap-2">
                <div className="flex-1 bg-background/50 backdrop-blur-sm rounded-xl px-3 py-2.5 font-mono text-xs border border-border/40 text-muted-foreground truncate select-all">
                  {refData.link}
                </div>
                <button onClick={copyRefLink}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-widest transition-all whitespace-nowrap"
                  style={{ backgroundColor: refData.color + "20", borderWidth: 1, borderStyle: "solid", borderColor: refData.color + "50", color: refData.color }}>
                  {refCopied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {refCopied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Earn <strong style={{ color: refData.color }}>{refData.commissionPct}%</strong> when a referred user deposits.{" "}
                <a href="/creator" className="font-bold hover:underline" style={{ color: refData.color }}>Full creator dashboard →</a>
              </p>
            </div>

            {refData.totalEarned > 0 && (
              <div className="flex items-center justify-between rounded-xl p-3 border"
                style={{ backgroundColor: refData.color + "08", borderColor: refData.color + "25" }}>
                <div className="flex items-center gap-2 text-xs font-bold">
                  <TrendingUp className="w-3.5 h-3.5" style={{ color: refData.color }} />
                  Total Commission Earned
                </div>
                <div className="font-mono font-black text-sm" style={{ color: refData.color }}>{formatCurrency(refData.totalEarned)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {(user.role === "owner" || user.role === "admin") && (
        <Card className="bg-card border-border border-yellow-500/30 shadow-[0_0_32px_rgba(255,215,0,0.08)]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-display uppercase tracking-widest text-lg flex items-center gap-2">
              <Landmark className="w-5 h-5 text-yellow-400" />
              <span className="text-yellow-400">Casino Bank — Live Plisio Balance</span>
            </CardTitle>
            <button onClick={fetchPlisioBalance} disabled={plisioLoading}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-yellow-400 transition-colors font-mono border border-border/50 rounded px-2 py-1">
              <RefreshCw className={`w-3 h-3 ${plisioLoading ? "animate-spin" : ""}`} />
              {lastRefresh ? lastRefresh.toLocaleTimeString() : "Refresh"}
            </button>
          </CardHeader>
          <CardContent>
            {plisioError && <p className="text-destructive text-sm font-mono">{plisioError}</p>}
            {plisioLoading && !plisioBalances && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[...Array(8)].map((_,i) => <div key={i} className="h-16 bg-secondary animate-pulse rounded-lg" />)}
              </div>
            )}
            {plisioBalances && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {Object.entries(plisioBalances).map(([currency, balance]) => (
                  <div key={currency} className="bg-secondary/50 border border-yellow-500/20 rounded-lg p-3 flex flex-col gap-1">
                    <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-yellow-400"><CoinIcon currency={currency} size={16} />{currency}</span>
                    <span className="font-mono font-black text-sm break-all">{String(balance)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Provably Fair Verification */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="font-display uppercase tracking-widest text-lg flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-500" />
            <span className="text-glow-shift">Provably Fair · SHA-256</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-secondary/50 border border-green-500/20 rounded-lg p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Every bet in DGC Arcade is mathematically verifiable using SHA-256 cryptography. After each game, you can verify that your outcome was not manipulated by the house.
            </p>
            <div className="space-y-2 text-xs font-mono">
              <div><span className="text-muted-foreground">How it works:</span></div>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-2">
                <li>Before each bet, a Server Seed Hash is generated and shown to you</li>
                <li>You provide a Client Seed (or we generate one for you)</li>
                <li>After the game, the unhashed Server Seed is revealed</li>
                <li>You can verify: HMAC-SHA256(serverSeed, clientSeed:nonce:cardIndex) matches the hash</li>
                <li>If it matches, the outcome is 100% mathematically fair</li>
              </ol>
            </div>
            <div className="bg-black/40 border border-green-500/30 rounded p-3 space-y-2">
              <div className="text-xs text-green-400 font-bold uppercase tracking-widest">Verification Instructions</div>
              <p className="text-xs text-muted-foreground">
                Click on any completed bet in your transaction history to view its Server Seed Hash, Client Seed, and Nonce. Then use the verification tool to confirm fairness.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Owner AI Assistant — only visible to the platform owner (fanodgc) */}
      {(user.role === "owner" || user.username === "fanodgc" || user.role === "admin") ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
            <span className="text-xs font-mono text-purple-400/70 uppercase tracking-widest">Owner AI Assistant</span>
          </div>
          <OwnerAiChat token={localStorage.getItem("dgc_token")} />
        </div>
      ) : null}
      <VipModal open={vipOpen} onClose={() => setVipOpen(false)} />
    </div>
  );
}