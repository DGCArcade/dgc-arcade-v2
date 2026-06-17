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
  Star, Lock, Link2, MessageSquare, Send,
  RefreshCw, X, Zap, BarChart3, DollarSign, Eye, EyeOff,
  ChevronRight, Shield, Info,
} from "lucide-react";

interface DashboardData {
  username: string;
  accountType: string;
  promoBalance: number;
  vaultBalance: number;
  referralCode: string;
  referralLink: string;
  tier: string;
  group: string;
  color: string;
  emoji: string;
  commissionRate: number;
  commissionPct: number;
  nextTierAt: number | null;
  description: string;
  isPrivate: boolean;
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

interface TierData {
  tier: string;
  group: string;
  commissionRate: number;
  nextTierAt: number | null;
  color: string;
  emoji: string;
  isPrivate: boolean;
  description: string;
}

function getToken() {
  return typeof localStorage !== "undefined" ? localStorage.getItem("dgc_token") : null;
}

const GROUP_COLORS: Record<string, string> = {
  Bronze: "#cd7f32",
  Silver: "#c0c0c0",
  Gold: "#ffd700",
  Platinum: "#e5e4e2",
  Private: "#ff6aff",
};

const GROUP_GRADIENTS: Record<string, string> = {
  Bronze: "from-amber-900/20 to-transparent",
  Silver: "from-slate-500/10 to-transparent",
  Gold: "from-yellow-500/15 to-transparent",
  Platinum: "from-cyan-300/10 to-transparent",
  Private: "from-fuchsia-500/15 to-transparent",
};

function TierBadge({ tier, color, emoji, size = "sm" }: { tier: string; color: string; emoji: string; size?: "sm" | "lg" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-widest border ${size === "lg" ? "px-4 py-1.5 text-sm" : "px-2.5 py-0.5 text-xs"}`}
      style={{ borderColor: color + "60", color, backgroundColor: color + "18" }}
    >
      {emoji} {tier}
    </span>
  );
}

// Vertical tier ladder — all 13 public tiers + 1 private
const TIER_LADDER = [
  { tier: "Hustler",      group: "Bronze",   emoji: "🥉", pct: 3,  at: 0,   color: "#cd7f32" },
  { tier: "Grinder",      group: "Bronze",   emoji: "💪", pct: 4,  at: 1,   color: "#c67a28" },
  { tier: "Baller",       group: "Bronze",   emoji: "🔥", pct: 5,  at: 2,   color: "#b06520" },
  { tier: "High Roller",  group: "Silver",   emoji: "🎰", pct: 5,  at: 4,   color: "#b0d0ff" },
  { tier: "Whale",        group: "Silver",   emoji: "🐋", pct: 6,  at: 7,   color: "#c0c0c0" },
  { tier: "Shark",        group: "Silver",   emoji: "🦈", pct: 8,  at: 12,  color: "#a0cfff" },
  { tier: "Legend",       group: "Gold",     emoji: "🥇", pct: 10, at: 20,  color: "#ffaa00" },
  { tier: "Icon",         group: "Gold",     emoji: "⭐", pct: 12, at: 35,  color: "#ffc53d" },
  { tier: "Goat",         group: "Gold",     emoji: "🐐", pct: 15, at: 60,  color: "#ffd700" },
  { tier: "Platinum I",   group: "Platinum", emoji: "🏆", pct: 20, at: 100, color: "#e5e4e2" },
  { tier: "Platinum II",  group: "Platinum", emoji: "💎", pct: 25, at: 200, color: "#c8e6ff" },
  { tier: "Platinum III", group: "Platinum", emoji: "💠", pct: 30, at: null, color: "#b9f2ff" },
  { tier: "Private",      group: "Private",  emoji: "🔒", pct: 0,  at: null, color: "#ff6aff" },
];

export default function CreatorPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [allTiers, setAllTiers] = useState<TierData[]>([]);
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

  const isCreator = user?.accountType === "creator" || user?.role === "creator";

  useEffect(() => {
    if (!isLoading && !isAuthenticated) setLocation("/");
  }, [isLoading, isAuthenticated, setLocation]);

  const fetchDashboard = useCallback(async () => {
    if (!isAuthenticated) return;
    const token = getToken();
    try {
      const [dash, refs, linked, tiersRes] = await Promise.all([
        fetch("/api/creator/dashboard", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch("/api/referrals/my-referrals", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch("/api/creator/linked-account", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch("/api/referrals/tiers").then(r => r.json()),
      ]);
      if (!dash.error) setDashboard(dash);
      if (Array.isArray(refs)) setReferrals(refs);
      if (linked?.linked) setLinkedAccount(linked.personalUser);
      if (tiersRes?.tiers) setAllTiers(tiersRes.tiers);
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
        toast({ title: "Account Linked!", description: `@${d.personalUser.username} is now your personal account.` });
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
    return <div className="text-center py-24 text-muted-foreground font-mono">Failed to load affiliate hub.</div>;
  }

  const tierColor = dashboard.color;
  const currentTierIdx = TIER_LADDER.findIndex(t => t.tier === dashboard.tier);
  const tierProgress = dashboard.nextTierAt
    ? Math.min((dashboard.activeReferrals / dashboard.nextTierAt) * 100, 100)
    : 100;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">

      {/* ── Hero Banner ── */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-6 md:p-8 bg-gradient-to-br ${GROUP_GRADIENTS[dashboard.group] ?? "from-primary/5 to-transparent"}`}
        style={{ borderColor: tierColor + "35" }}
      >
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `repeating-linear-gradient(45deg, ${tierColor} 0, ${tierColor} 1px, transparent 0, transparent 50%)`,
          backgroundSize: "20px 20px",
        }} />
        <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-lg"
                style={{ backgroundColor: tierColor + "20", border: `1px solid ${tierColor}40` }}
              >
                {dashboard.emoji}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="font-display font-black text-2xl md:text-3xl uppercase tracking-widest">
                    {isCreator ? "Creator Hub" : "Affiliate Hub"}
                  </h1>
                  {isCreator && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-400 text-[10px] font-black uppercase tracking-widest">
                      <Star className="w-2.5 h-2.5 fill-purple-400" /> Creator
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm font-mono">@{dashboard.username}</span>
                  <TierBadge tier={dashboard.tier} color={tierColor} emoji={dashboard.emoji} />
                </div>
              </div>
            </div>
          </div>

          {/* Balance Cards — only for creators */}
          {isCreator && (
            <div className="flex gap-3 flex-wrap">
              <div className="bg-background/60 backdrop-blur-sm border rounded-xl p-4 min-w-[140px]"
                style={{ borderColor: tierColor + "30" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Promo Balance</span>
                  <button onClick={() => setHideBalance(v => !v)} className="text-muted-foreground hover:text-foreground transition-colors">
                    {hideBalance ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
                <div className="font-mono font-black text-xl" style={{ color: tierColor }}>
                  {hideBalance ? "••••••" : formatCurrency(dashboard.promoBalance)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">non-withdrawable</div>
              </div>
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
          )}
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

      {/* ── Personal Account Banner (creators only) ── */}
      {isCreator && !linkedAccount && (
        <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Link2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-bold text-sm">Link Your Personal Account</p>
              <p className="text-xs text-muted-foreground">Link your regular play account for deposits, withdrawals & profile switching.</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setLinkModalOpen(true)} className="whitespace-nowrap">Link Now</Button>
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
              <p className="text-xs text-muted-foreground">@{linkedAccount.username} · {formatCurrency(linkedAccount.balance)} · Switch from the top menu</p>
            </div>
          </div>
          <button onClick={() => setLinkModalOpen(true)} className="text-xs text-muted-foreground hover:text-foreground transition-colors underline">Change</button>
        </div>
      )}

      {/* ── Main Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-secondary w-full flex">
          <TabsTrigger value="overview" className="flex-1 font-bold uppercase text-xs">Overview</TabsTrigger>
          <TabsTrigger value="referrals" className="flex-1 font-bold uppercase text-xs">Referrals</TabsTrigger>
          <TabsTrigger value="earnings" className="flex-1 font-bold uppercase text-xs">Earnings</TabsTrigger>
          <TabsTrigger value="tiers" className="flex-1 font-bold uppercase text-xs">All Tiers</TabsTrigger>
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

        {/* ─── Overview Tab ─── */}
        <TabsContent value="overview" className="space-y-4 mt-4">

          {/* Commission explainer */}
          <Card className="bg-card border-border">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                  <Info className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold uppercase tracking-widest text-sm mb-1">How Commissions Work</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Every user you refer plays on DGC Arcade. At the end of each month, we calculate the total
                    <strong className="text-foreground"> casino profit</strong> (house wins minus house losses) across all your active referrals.
                    You earn <strong style={{ color: tierColor }}>{dashboard.commissionPct}%</strong> of that amount — paid to your account monthly.
                  </p>
                  <div className="mt-3 p-3 rounded-lg bg-secondary/60 border border-border/40">
                    <p className="text-xs text-muted-foreground font-mono">
                      Example: 50 referrals · $1,000 house profit → you earn <strong className="text-green-400">{formatCurrency(1000 * dashboard.commissionRate)}</strong> ({dashboard.commissionPct}%)
                    </p>
                  </div>
                </div>
              </div>

              {/* Tier progress bar */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                  <span className="font-bold uppercase tracking-widest text-sm">{dashboard.tier} — {dashboard.commissionPct}% commission</span>
                </div>
                {dashboard.nextTierAt
                  ? <span className="text-xs text-muted-foreground font-mono">{dashboard.activeReferrals} / {dashboard.nextTierAt} active refs for next tier</span>
                  : <span className="text-xs font-mono font-bold" style={{ color: tierColor }}>MAX TIER 🏆</span>
                }
              </div>
              <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${tierProgress}%`, backgroundColor: tierColor }} />
              </div>
              {dashboard.nextTierAt && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  {dashboard.nextTierAt - dashboard.activeReferrals} more active referrals to unlock the next tier
                </p>
              )}
            </CardContent>
          </Card>

          {/* Referral link */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="font-display uppercase tracking-widest text-base">Your Referral Link</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <div className="flex-1 bg-secondary/80 rounded-lg px-4 py-3 font-mono text-sm border border-border/50 break-all text-muted-foreground select-all">
                  {dashboard.referralLink}
                </div>
                <button onClick={copyLink}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm uppercase tracking-widest hover:bg-primary/90 transition-colors whitespace-nowrap">
                  {copied ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Share this link. Every player who signs up and deposits earns you <strong className="text-primary">{dashboard.commissionPct}%</strong> monthly commission.
              </p>
            </CardContent>
          </Card>

          {/* Quick group breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(["Bronze", "Silver", "Gold", "Platinum"] as const).map(group => {
              const groupColor = GROUP_COLORS[group];
              const isCurrentGroup = dashboard.group === group;
              return (
                <div key={group} className={`rounded-xl border p-3 transition-colors ${isCurrentGroup ? "border-opacity-60" : "border-border/30 bg-secondary/20"}`}
                  style={isCurrentGroup ? { borderColor: groupColor + "50", background: groupColor + "08" } : {}}>
                  <div className="text-lg mb-1">
                    {group === "Bronze" ? "🥉" : group === "Silver" ? "🥈" : group === "Gold" ? "🥇" : "💎"}
                  </div>
                  <div className="font-bold text-xs uppercase tracking-widest mb-0.5" style={{ color: isCurrentGroup ? groupColor : undefined }}>{group}</div>
                  <div className="text-[10px] text-muted-foreground">3 tiers · up to {group === "Bronze" ? "5" : group === "Silver" ? "8" : group === "Gold" ? "15" : "30"}%</div>
                  {isCurrentGroup && <div className="mt-1.5 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: groupColor }} />}
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ─── Referrals Tab ─── */}
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
                  <p>No referrals yet.</p>
                  <p className="text-xs mt-1 opacity-60">Share your referral link to start earning.</p>
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

        {/* ─── Earnings Tab ─── */}
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
                  <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1">Promo Balance</div>
                  <div className="font-mono font-black text-2xl" style={{ color: tierColor }}>{formatCurrency(dashboard.promoBalance)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">non-withdrawable credits</div>
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

        {/* ─── All Tiers Tab ─── */}
        <TabsContent value="tiers" className="mt-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="font-display uppercase tracking-widest text-base">Affiliate Tier Ladder</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Commission is paid monthly based on your referred users' net casino activity.</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {TIER_LADDER.map((t, i) => {
                  const isCurrent = t.tier === dashboard.tier && t.group === dashboard.group;
                  const isPassed = currentTierIdx > i;
                  const isLocked = t.group === "Private";

                  return (
                    <div key={`${t.tier}-${i}`}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        isCurrent
                          ? "border-opacity-70 shadow-sm"
                          : isPassed
                            ? "border-border/20 bg-secondary/10 opacity-60"
                            : isLocked
                              ? "border-border/20 bg-secondary/10"
                              : "border-border/30 bg-secondary/20"
                      }`}
                      style={isCurrent ? { borderColor: t.color + "60", background: t.color + "0a" } : {}}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                          style={{ backgroundColor: t.color + "15", border: `1px solid ${t.color}30` }}>
                          {t.emoji}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm" style={isCurrent ? { color: t.color } : {}}>
                              {t.tier}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                              style={{ color: GROUP_COLORS[t.group], backgroundColor: GROUP_COLORS[t.group] + "15" }}>
                              {t.group}
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-primary/15 text-primary animate-pulse">
                                YOU
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {isLocked ? "Invite only · Contract rate" : `${t.at !== null ? `${t.at}+ active refs` : "Max tier"}`}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {isLocked ? (
                          <div className="flex items-center gap-1.5 justify-end">
                            <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground font-bold">Private</span>
                          </div>
                        ) : (
                          <div>
                            <div className="font-mono font-black text-base" style={{ color: t.color }}>{t.pct}%</div>
                            <div className="text-[10px] text-muted-foreground">monthly</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 p-4 rounded-xl bg-secondary/40 border border-border/30">
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">Private tier</strong> is invite-only and contract-based.
                    Commissions are negotiated individually based on audience size and platform contribution.
                    Interested in joining? Contact us via Discord or <strong className="text-foreground">support@dgcarcade.com</strong>.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Messages Tab ─── */}
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
                  No messages yet. Platform updates will appear here.
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

        {/* ─── Promo Tools Tab (creators only) ─── */}
        {isCreator && (
          <TabsContent value="promo" className="space-y-4 mt-4">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="font-display uppercase tracking-widest text-base flex items-center gap-2">
                  <Gift className="w-4 h-4 text-primary" /> Send Promo Tip
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Send promo credits from your balance to any player — perfect for stream giveaways and community events.
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
