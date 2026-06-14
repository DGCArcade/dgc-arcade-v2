import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Users, Copy, CheckCheck, TrendingUp, Coins, Gift, ArrowDownLeft,
  Star, Crown, Medal, Lock, Unlock, Link2, MessageSquare, Send,
  RefreshCw, X, ChevronRight, Zap, BarChart3, DollarSign, Eye, EyeOff,
} from "lucide-react";

interface DashboardData {
  username: string;
  accountType: string;
  promoBalance: number;
  vaultBalance: number;
  referralCode: string;
  referralLink: string;
  tier: string;
  color: string;
  emoji: string;
  commissionRate: number;
  commissionPct: number;
  nextTierAt: number | null;
  activeReferrals: number;
  pendingReferrals: number;
  totalCommissionEarned: number;
  bankHistory: Array<{
    id: number;
    type: string;
    amount: number;
    description: string;
    createdAt: string;
    toUserId: number | null;
  }>;
}

interface Referral {
  id: number;
  username: string;
  status: string;
  earned: number;
  joinedAt: string;
}

interface CreatorMessage {
  id: number;
  senderId: number;
  senderUsername: string;
  senderRole: string;
  recipientType: string;
  recipientId: number | null;
  message: string;
  createdAt: string;
  read: boolean;
}

function getToken() {
  return typeof localStorage !== "undefined" ? localStorage.getItem("dgc_token") : null;
}

function TierBadge({ tier, color, emoji }: { tier: string; color: string; emoji: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest border"
      style={{ borderColor: color + "60", color, backgroundColor: color + "15" }}
    >
      {emoji} {tier}
    </span>
  );
}

export default function CreatorPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [dashLoading, setDashLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [tipTo, setTipTo] = useState("");
  const [tipAmt, setTipAmt] = useState(10);
  const [tipLoading, setTipLoading] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);

  const [linkedAccount, setLinkedAccount] = useState<{ id: number; username: string; balance: number } | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUsername, setLinkUsername] = useState("");
  const [linkPassword, setLinkPassword] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);

  const [messages, setMessages] = useState<CreatorMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [msgLoading, setMsgLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const messagesBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) setLocation("/");
  }, [isLoading, isAuthenticated, setLocation]);

  const fetchDashboard = useCallback(async () => {
    if (!isAuthenticated) return;
    const token = getToken();
    try {
      const [dash, refs, linked] = await Promise.all([
        fetch("/api/creator/dashboard", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch("/api/referrals/my-referrals", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch("/api/creator/linked-account", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      ]);
      if (!dash.error) setDashboard(dash);
      if (Array.isArray(refs)) setReferrals(refs);
      if (linked?.linked) setLinkedAccount(linked.personalUser);
    } catch {}
    finally { setDashLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const fetchMessages = useCallback(async () => {
    if (!isAuthenticated) return;
    const token = getToken();
    setMsgLoading(true);
    try {
      const res = await fetch("/api/creator/messages", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.messages) {
        setMessages(data.messages);
        setUnreadCount(data.messages.filter((m: CreatorMessage) => !m.read).length);
        setTimeout(() => messagesBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }
    } catch {} finally { setMsgLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => {
    if (activeTab === "messages") {
      fetchMessages();
      const id = setInterval(fetchMessages, 8000);
      return () => clearInterval(id);
    }
  }, [activeTab, fetchMessages]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const token = getToken();
    fetch("/api/creator/messages/unread-count", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.unread) setUnreadCount(d.unread); }).catch(() => {});
    const id = setInterval(() => {
      fetch("/api/creator/messages/unread-count", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setUnreadCount(d.unread ?? 0)).catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  const markMessagesRead = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;
    const token = getToken();
    try {
      await fetch("/api/creator/messages/read", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messageIds: ids }),
      });
      setMessages(prev => prev.map(m => ids.includes(m.id) ? { ...m, read: true } : m));
      setUnreadCount(0);
    } catch {}
  }, []);

  useEffect(() => {
    if (activeTab === "messages" && messages.length > 0) {
      const unreadIds = messages.filter(m => !m.read).map(m => m.id);
      if (unreadIds.length > 0) markMessagesRead(unreadIds);
    }
  }, [activeTab, messages, markMessagesRead]);

  const copyLink = async () => {
    if (!dashboard) return;
    await navigator.clipboard.writeText(dashboard.referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Referral link copied to clipboard." });
  };

  const sendTip = async () => {
    if (!tipTo.trim() || tipAmt <= 0) return;
    setTipLoading(true);
    try {
      const res = await fetch("/api/creator/bank/tip", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ toUsername: tipTo.trim(), amount: tipAmt }),
      });
      const d = await res.json();
      if (res.ok) {
        toast({ title: "Promo Tip Sent!", description: `Sent ${formatCurrency(tipAmt)} to @${tipTo}` });
        setTipTo("");
        setDashboard(prev => prev ? { ...prev, promoBalance: d.newPromoBalance } : prev);
      } else {
        toast({ title: "Error", description: d.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally { setTipLoading(false); }
  };

  const linkAccount = async () => {
    if (!linkUsername.trim() || !linkPassword) return;
    setLinkLoading(true);
    try {
      const res = await fetch("/api/creator/link-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ username: linkUsername.trim(), password: linkPassword }),
      });
      const d = await res.json();
      if (res.ok) {
        localStorage.setItem("dgc_alt_token", d.personalToken);
        localStorage.setItem("dgc_alt_profile_type", "personal");
        localStorage.setItem("dgc_creator_token", getToken() ?? "");
        setLinkedAccount(d.personalUser);
        setLinkModalOpen(false);
        setLinkUsername("");
        setLinkPassword("");
        toast({ title: "Account Linked!", description: `@${d.personalUser.username} is now your personal account. Switch profiles from the nav menu.` });
      } else {
        toast({ title: "Error", description: d.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally { setLinkLoading(false); }
  };

  if (isLoading || dashLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 pt-8">
        <div className="h-40 bg-secondary animate-pulse rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-secondary animate-pulse rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return <div className="text-center py-24 text-muted-foreground font-mono">Failed to load creator hub.</div>;
  }

  const isCreator = user?.accountType === "creator";
  const tierProgress = dashboard.nextTierAt
    ? Math.min((dashboard.activeReferrals / dashboard.nextTierAt) * 100, 100)
    : 100;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">

      {/* ── Hero Banner ── */}
      <div
        className="relative overflow-hidden rounded-2xl border p-6 md:p-8"
        style={{
          borderColor: dashboard.color + "40",
          background: `linear-gradient(135deg, ${dashboard.color}08 0%, transparent 60%)`,
        }}
      >
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: `repeating-linear-gradient(45deg, ${dashboard.color} 0, ${dashboard.color} 1px, transparent 0, transparent 50%)`,
          backgroundSize: "20px 20px",
        }} />
        <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-2xl"
                style={{ backgroundColor: dashboard.color + "20", border: `1px solid ${dashboard.color}40` }}
              >
                {dashboard.emoji}
              </div>
              <div>
                <h1 className="font-display font-black text-2xl md:text-3xl uppercase tracking-widest">Creator Hub</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-muted-foreground text-sm font-mono">@{dashboard.username}</span>
                  <TierBadge tier={dashboard.tier} color={dashboard.color} emoji={dashboard.emoji} />
                </div>
              </div>
            </div>
          </div>

          {/* Balance + Vault Cards */}
          <div className="flex gap-3 flex-wrap">
            {isCreator && (
              <div className="bg-background/60 backdrop-blur-sm border rounded-xl p-4 min-w-[140px]"
                style={{ borderColor: dashboard.color + "30" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Balance</span>
                  <button onClick={() => setHideBalance(v => !v)} className="text-muted-foreground hover:text-foreground transition-colors">
                    {hideBalance ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
                <div className="font-mono font-black text-xl" style={{ color: dashboard.color }}>
                  {hideBalance ? "••••••" : formatCurrency(dashboard.promoBalance)}
                </div>
              </div>
            )}
            <div className="bg-background/60 backdrop-blur-sm border border-border/40 rounded-xl p-4 min-w-[140px]">
              <div className="flex items-center gap-1.5 mb-1">
                <Lock className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Vault</span>
              </div>
              <div className="font-mono font-black text-xl text-foreground">
                {hideBalance ? "••••••" : formatCurrency(dashboard.vaultBalance)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Active Referrals", value: String(dashboard.activeReferrals), icon: <Users className="w-4 h-4" />, color: "text-green-400", bg: "bg-green-500/10" },
          { label: "Commission Rate", value: `${dashboard.commissionPct}%`, icon: <TrendingUp className="w-4 h-4" />, color: "text-primary", bg: "bg-primary/10" },
          { label: "Total Earned", value: formatCurrency(dashboard.totalCommissionEarned), icon: <Coins className="w-4 h-4" />, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "Pending", value: String(dashboard.pendingReferrals), icon: <Zap className="w-4 h-4" />, color: "text-yellow-400", bg: "bg-yellow-500/10" },
        ].map(s => (
          <Card key={s.label} className="bg-card border-border hover:border-border/80 transition-colors">
            <CardContent className="pt-4 pb-4">
              <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center mb-2 ${s.color}`}>{s.icon}</div>
              <div className={`font-mono font-black text-lg ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mt-0.5">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Personal Account Banner (if not linked) ── */}
      {isCreator && !linkedAccount && (
        <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Link2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-bold text-sm">Link Your Personal Account</p>
              <p className="text-xs text-muted-foreground">Required — link your regular play account for deposits, withdrawals & switching profiles.</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setLinkModalOpen(true)} className="whitespace-nowrap">
            Link Now
          </Button>
        </div>
      )}

      {isCreator && linkedAccount && (
        <div className="rounded-xl border border-border/40 bg-secondary/30 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
              <Link2 className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <p className="font-bold text-sm text-green-400">Personal Account Linked</p>
              <p className="text-xs text-muted-foreground">@{linkedAccount.username} · {formatCurrency(linkedAccount.balance)} · Switch profiles from the top menu</p>
            </div>
          </div>
          <button
            onClick={() => setLinkModalOpen(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
          >
            Change
          </button>
        </div>
      )}

      {/* ── Main Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-secondary w-full flex">
          <TabsTrigger value="overview" className="flex-1 font-bold uppercase text-xs">Overview</TabsTrigger>
          <TabsTrigger value="referrals" className="flex-1 font-bold uppercase text-xs">Referrals</TabsTrigger>
          <TabsTrigger value="earnings" className="flex-1 font-bold uppercase text-xs">Earnings</TabsTrigger>
          <TabsTrigger value="messages" className="flex-1 font-bold uppercase text-xs relative">
            Messages
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-black flex items-center justify-center px-1 animate-pulse">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </TabsTrigger>
          {isCreator && <TabsTrigger value="promo" className="flex-1 font-bold uppercase text-xs">Promo</TabsTrigger>}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Tier Progress */}
          <Card className="bg-card border-border">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                  <span className="font-bold uppercase tracking-widest text-sm">{dashboard.tier} Tier — {dashboard.commissionPct}% commission</span>
                </div>
                {dashboard.nextTierAt
                  ? <span className="text-xs text-muted-foreground font-mono">{dashboard.activeReferrals} / {dashboard.nextTierAt} refs for next tier</span>
                  : <span className="text-xs text-primary font-mono font-bold">MAX TIER 🏆</span>
                }
              </div>
              <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${tierProgress}%`, backgroundColor: dashboard.color }} />
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                {[
                  { tier: "Bronze", pct: "3%", min: 0, emoji: "🥉" },
                  { tier: "Silver", pct: "5%", min: 5, emoji: "🥈" },
                  { tier: "Gold", pct: "7%", min: 20, emoji: "🥇" },
                  { tier: "Platinum", pct: "10%", min: 50, emoji: "💎" },
                ].map(t => (
                  <div key={t.tier} className={`text-xs rounded-lg p-2 border transition-colors ${dashboard.tier === t.tier ? "border-primary/40 bg-primary/10" : "border-border/40 bg-secondary/30"}`}>
                    <div className="text-lg">{t.emoji}</div>
                    <div className="font-bold">{t.tier}</div>
                    <div className="text-muted-foreground">{t.pct}</div>
                    <div className="text-muted-foreground/60">{t.min}+ refs</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Referral Link quick copy */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="font-display uppercase tracking-widest text-base">Your Creator Link</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <div className="flex-1 bg-secondary/80 rounded-lg px-4 py-3 font-mono text-sm border border-border/50 break-all text-muted-foreground">
                  {dashboard.referralLink}
                </div>
                <button onClick={copyLink}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm uppercase tracking-widest hover:bg-primary/90 transition-colors whitespace-nowrap">
                  {copied ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Every player who deposits via your link earns you <strong className="text-primary">{dashboard.commissionPct}%</strong> monthly commission based on casino profit.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Referrals Tab */}
        <TabsContent value="referrals" className="space-y-4 mt-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="font-display uppercase tracking-widest text-base flex items-center justify-between">
                <span>Your Referrals ({referrals.length})</span>
                <button onClick={fetchDashboard} className="text-muted-foreground hover:text-foreground transition-colors">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {referrals.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground font-mono text-sm border border-dashed border-border rounded-lg">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No referrals yet. Share your creator link to start earning!
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {referrals.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-secondary/30 hover:bg-secondary/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-secondary border border-border flex items-center justify-center font-black text-sm text-primary">
                          {r.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-mono font-bold text-sm">{r.username}</div>
                          <div className="text-xs text-muted-foreground">{new Date(r.joinedAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${r.status === "active" ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"}`}>
                          {r.status}
                        </span>
                        <span className="font-mono font-bold text-green-400 text-sm">+{formatCurrency(r.earned)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Earnings Tab */}
        <TabsContent value="earnings" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-3 mb-2">
            <Card className="bg-card border-border">
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1">Total Earned</div>
                <div className="font-mono font-black text-2xl text-emerald-400">{formatCurrency(dashboard.totalCommissionEarned)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">lifetime commissions</div>
              </CardContent>
            </Card>
            {isCreator && (
              <Card className="bg-card border-border">
                <CardContent className="pt-4 pb-4">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1">Current Balance</div>
                  <div className="font-mono font-black text-2xl" style={{ color: dashboard.color }}>
                    {formatCurrency(dashboard.promoBalance)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">available to spend</div>
                </CardContent>
              </Card>
            )}
          </div>
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="font-display uppercase tracking-widest text-base">Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.bankHistory.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground font-mono text-sm border border-dashed border-border rounded-lg">
                  <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No transactions yet.
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {dashboard.bankHistory.map(h => (
                    <div key={h.id} className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-secondary/30">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${h.type === "promo_tip" ? "bg-blue-500/10 text-blue-400" : "bg-green-500/10 text-green-500"}`}>
                          {h.type === "promo_tip" ? <Gift className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="font-bold text-sm capitalize">{h.type.replace(/_/g, " ")}</div>
                          <div className="text-xs text-muted-foreground">{h.description}</div>
                          <div className="text-xs text-muted-foreground/50">{new Date(h.createdAt).toLocaleString()}</div>
                        </div>
                      </div>
                      <span className={`font-mono font-bold ${h.type === "promo_tip" ? "text-blue-400" : "text-green-400"}`}>
                        {h.type === "promo_tip" ? "-" : "+"}{formatCurrency(h.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Messages Tab */}
        <TabsContent value="messages" className="mt-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="font-display uppercase tracking-widest text-base flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" /> Messages
                  {unreadCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-black">{unreadCount} new</span>
                  )}
                </CardTitle>
                <button onClick={fetchMessages} className="text-muted-foreground hover:text-foreground transition-colors">
                  <RefreshCw className={`w-4 h-4 ${msgLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {messages.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground font-mono text-sm border border-dashed border-border rounded-lg">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No messages yet. Messages from the platform team will appear here.
                </div>
              ) : (
                <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                  {messages.map(msg => {
                    const isOwnerMsg = msg.senderRole === "owner";
                    const isBroadcast = msg.recipientType !== "direct";
                    return (
                      <div key={msg.id} className={`rounded-xl border p-4 transition-colors ${!msg.read ? "border-primary/30 bg-primary/5" : "border-border/40 bg-secondary/20"}`}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${isOwnerMsg ? "bg-yellow-500/20 text-yellow-400" : "bg-purple-500/20 text-purple-400"}`}>
                              {msg.senderUsername.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className={`font-bold text-sm ${isOwnerMsg ? "text-yellow-400" : "text-purple-400"}`}>
                                {msg.senderUsername}
                              </span>
                              <span className={`ml-2 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${isOwnerMsg ? "bg-yellow-500/10 text-yellow-500" : "bg-purple-500/10 text-purple-400"}`}>
                                {isOwnerMsg ? "Owner" : "Admin"}
                              </span>
                              {isBroadcast && (
                                <span className="ml-1.5 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                                  {msg.recipientType === "broadcast_all" ? "All" : "All Creators"}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {!msg.read && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
                            <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">
                              {new Date(msg.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm leading-relaxed">{msg.message}</p>
                      </div>
                    );
                  })}
                  <div ref={messagesBottomRef} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Promo Tools Tab */}
        {isCreator && (
          <TabsContent value="promo" className="space-y-4 mt-4">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="font-display uppercase tracking-widest text-base flex items-center gap-2">
                  <Gift className="w-4 h-4 text-primary" />
                  Send Promo Tip
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Send funds from your balance to any player — perfect for stream giveaways and community events.
                  Available: <strong className="text-primary">{formatCurrency(dashboard.promoBalance)}</strong>
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground block mb-1">Recipient Username</label>
                    <input type="text" value={tipTo} onChange={e => setTipTo(e.target.value)}
                      placeholder="@username"
                      className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/60 transition-colors" />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground block mb-1">Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">$</span>
                      <input type="number" min={1} value={tipAmt} onChange={e => setTipAmt(Number(e.target.value))}
                        className="w-full rounded-md border border-border bg-secondary pl-8 pr-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/60 transition-colors" />
                    </div>
                    <div className="flex gap-1 mt-2">
                      {[5, 10, 25, 50, 100].map(v => (
                        <button key={v} type="button" onClick={() => setTipAmt(v)}
                          className="flex-1 text-xs py-1.5 rounded bg-secondary border border-border font-mono hover:border-primary/40 transition-colors">
                          ${v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={sendTip}
                    disabled={tipLoading || !tipTo.trim() || tipAmt <= 0 || tipAmt > dashboard.promoBalance}
                    className="w-full h-10 rounded-md bg-primary text-primary-foreground font-bold uppercase tracking-widest text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                    <Gift className="w-4 h-4" />
                    {tipLoading ? "Sending…" : `Send ${formatCurrency(tipAmt)}`}
                  </button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* ── Link Account Modal ── */}
      {linkModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setLinkModalOpen(false)}>
          <div className="bg-card border border-border/60 rounded-2xl p-7 w-full max-w-sm shadow-2xl mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                  <Link2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-display font-black uppercase tracking-widest text-lg">Link Personal Account</h2>
                  <p className="text-xs text-muted-foreground">Enter your regular account credentials</p>
                </div>
              </div>
              <button onClick={() => setLinkModalOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">Username</label>
                <input type="text" value={linkUsername} onChange={e => setLinkUsername(e.target.value)}
                  placeholder="your personal account username"
                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-primary/60 transition-colors" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">Password</label>
                <input type="password" value={linkPassword} onChange={e => setLinkPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-primary/60 transition-colors"
                  onKeyDown={e => { if (e.key === "Enter") linkAccount(); }} />
              </div>
              <p className="text-xs text-muted-foreground">This is the account you use for deposits and withdrawals. You'll be able to switch between profiles from the menu.</p>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setLinkModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border/50 text-sm font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
                <button onClick={linkAccount}
                  disabled={linkLoading || !linkUsername.trim() || !linkPassword}
                  className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 text-sm font-bold uppercase tracking-wider text-primary-foreground transition-colors">
                  {linkLoading ? "Linking…" : "Link Account"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
