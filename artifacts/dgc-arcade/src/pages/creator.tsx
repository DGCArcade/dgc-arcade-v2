import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users, Copy, CheckCheck, TrendingUp, Coins, Gift, ArrowUpRight, ArrowDownLeft, Star, Crown, Medal
} from "lucide-react";

interface DashboardData {
  username: string;
  accountType: string;
  promoBalance: number;
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

function getToken() {
  return typeof localStorage !== "undefined" ? localStorage.getItem("dgc_token") : null;
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

  useEffect(() => {
    if (!isLoading && !isAuthenticated) setLocation("/");
  }, [isLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const token = getToken();

    Promise.all([
      fetch("/api/creator/dashboard", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch("/api/referrals/my-referrals", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([dash, refs]) => {
      if (!dash.error) setDashboard(dash);
      if (Array.isArray(refs)) setReferrals(refs);
    }).catch(() => {}).finally(() => setDashLoading(false));
  }, [isAuthenticated]);

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
        toast({ title: "Promo Tip Sent!", description: `Sent ${formatCurrency(tipAmt)} promo credits to @${tipTo}` });
        setTipTo("");
        setDashboard(prev => prev ? { ...prev, promoBalance: d.newPromoBalance } : prev);
      } else {
        toast({ title: "Error", description: d.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setTipLoading(false);
    }
  };

  if (isLoading || dashLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="h-32 bg-secondary animate-pulse rounded-xl" />
        <div className="grid grid-cols-3 gap-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-secondary animate-pulse rounded-xl" />)}</div>
      </div>
    );
  }

  if (!dashboard) {
    return <div className="text-center py-24 text-muted-foreground font-mono">Failed to load creator dashboard.</div>;
  }

  const isCreator = user?.accountType === "creator";
  const tierProgress = dashboard.nextTierAt
    ? Math.min((dashboard.activeReferrals / dashboard.nextTierAt) * 100, 100)
    : 100;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/50 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-display font-black text-3xl uppercase tracking-widest">Creator Hub</h1>
            <TierBadge tier={dashboard.tier} color={dashboard.color} emoji={dashboard.emoji} />
          </div>
          <p className="text-muted-foreground text-sm font-mono">@{dashboard.username}</p>
        </div>
        {isCreator && (
          <div className="bg-secondary/60 border border-primary/20 rounded-xl p-4 text-right">
            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Creator Bank Balance</div>
            <div className="font-mono font-black text-2xl text-primary">{formatCurrency(dashboard.promoBalance)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Promo credits only</div>
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Referrals", value: dashboard.activeReferrals, icon: <Users className="w-5 h-5 text-green-400" />, color: "text-green-400" },
          { label: "Pending Referrals", value: dashboard.pendingReferrals, icon: <Users className="w-5 h-5 text-yellow-400" />, color: "text-yellow-400" },
          { label: "Commission Rate", value: `${dashboard.commissionPct}%`, icon: <TrendingUp className="w-5 h-5 text-primary" />, color: "text-primary" },
          { label: "Total Earned", value: formatCurrency(dashboard.totalCommissionEarned), icon: <Coins className="w-5 h-5 text-emerald-400" />, color: "text-emerald-400" },
        ].map(s => (
          <Card key={s.label} className="bg-card border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-2">{s.icon}<span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">{s.label}</span></div>
              <div className={`font-mono font-black text-xl ${s.color}`}>{String(s.value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tier Progress */}
      <Card className="bg-card border-border">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">{dashboard.emoji}</span>
              <span className="font-bold uppercase tracking-widest text-sm">{dashboard.tier} Tier — {dashboard.commissionPct}% commission</span>
            </div>
            {dashboard.nextTierAt && (
              <span className="text-xs text-muted-foreground font-mono">{dashboard.activeReferrals} / {dashboard.nextTierAt} active referrals for next tier</span>
            )}
            {!dashboard.nextTierAt && <span className="text-xs text-primary font-mono font-bold">MAX TIER 🏆</span>}
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${tierProgress}%`, backgroundColor: dashboard.color }}
            />
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            {[
              { tier: "Bronze", pct: "3%", min: 0, emoji: "🥉" },
              { tier: "Silver", pct: "5%", min: 5, emoji: "🥈" },
              { tier: "Gold",   pct: "7%", min: 20, emoji: "🥇" },
              { tier: "Platinum", pct: "10%", min: 50, emoji: "💎" },
            ].map(t => (
              <div key={t.tier} className={`text-xs rounded-lg p-2 border transition-colors ${dashboard.tier === t.tier ? "border-primary/40 bg-primary/10" : "border-border/40 bg-secondary/30"}`}>
                <div>{t.emoji}</div>
                <div className="font-bold">{t.tier}</div>
                <div className="text-muted-foreground">{t.pct}</div>
                <div className="text-muted-foreground/60">{t.min}+ refs</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs defaultValue="referrals">
        <TabsList className="bg-secondary grid w-full grid-cols-3">
          <TabsTrigger value="referrals" className="font-bold uppercase text-xs">Referrals</TabsTrigger>
          <TabsTrigger value="bank" className="font-bold uppercase text-xs">Creator Bank</TabsTrigger>
          {isCreator && <TabsTrigger value="promo" className="font-bold uppercase text-xs">Promo Tools</TabsTrigger>}
          {!isCreator && <TabsTrigger value="about" className="font-bold uppercase text-xs">About</TabsTrigger>}
        </TabsList>

        {/* Referrals Tab */}
        <TabsContent value="referrals" className="space-y-4 mt-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="font-display uppercase tracking-widest text-base">Your Referral Link</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1 bg-secondary/80 rounded-lg px-4 py-3 font-mono text-sm border border-border/50 break-all">
                  {dashboard.referralLink}
                </div>
                <button
                  onClick={copyLink}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm uppercase tracking-widest hover:bg-primary/90 transition-colors whitespace-nowrap"
                >
                  {copied ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Share this link. When someone registers and deposits, you earn <strong className="text-primary">{dashboard.commissionPct}%</strong> of their deposit as a commission — paid instantly to your balance.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="font-display uppercase tracking-widest text-base">Your Referrals ({referrals.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {referrals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground font-mono text-sm border border-dashed border-border rounded-lg">
                  No referrals yet. Share your link to start earning!
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {referrals.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-secondary/30">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center font-bold text-xs text-primary">
                          {r.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-mono font-bold text-sm">{r.username}</div>
                          <div className="text-xs text-muted-foreground">{new Date(r.joinedAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${r.status === "active" ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                          {r.status}
                        </span>
                        <span className="font-mono font-bold text-primary text-sm">+{formatCurrency(r.earned)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Creator Bank Tab */}
        <TabsContent value="bank" className="space-y-4 mt-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="font-display uppercase tracking-widest text-base">Creator DGC Bank</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-xs text-muted-foreground mb-4">
                All transactions below use promo credits — separate from your real wallet balance. Promo credits cannot be withdrawn.
              </div>
              {dashboard.bankHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground font-mono text-sm border border-dashed border-border rounded-lg">
                  No transactions yet.
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {dashboard.bankHistory.map(h => (
                    <div key={h.id} className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-secondary/30">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${h.type === "admin_deposit" || h.type === "referral_commission" ? "bg-green-500/10 text-green-500" : "bg-blue-500/10 text-blue-400"}`}>
                          {h.type === "promo_tip" ? <Gift className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="font-bold text-sm capitalize">{h.type.replace(/_/g, " ")}</div>
                          <div className="text-xs text-muted-foreground">{h.description || ""}</div>
                          <div className="text-xs text-muted-foreground/60">{new Date(h.createdAt).toLocaleString()}</div>
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

        {/* Promo Tools Tab (creator only) */}
        {isCreator && (
          <TabsContent value="promo" className="space-y-4 mt-4">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="font-display uppercase tracking-widest text-base">Send Promo Tip</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Send promo credits from your Creator Bank to any player — perfect for stream giveaways and community events.
                  Credits come from your promo balance (<strong className="text-primary">{formatCurrency(dashboard.promoBalance)}</strong> available).
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground block mb-1">Recipient Username</label>
                    <input
                      type="text"
                      value={tipTo}
                      onChange={e => setTipTo(e.target.value)}
                      placeholder="username"
                      className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground block mb-1">Amount (Promo Credits)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">$</span>
                      <input
                        type="number"
                        min={1}
                        value={tipAmt}
                        onChange={e => setTipAmt(Number(e.target.value))}
                        className="w-full rounded-md border border-border bg-secondary pl-8 pr-3 py-2 text-sm font-mono"
                      />
                    </div>
                    <div className="flex gap-1 mt-2">
                      {[5, 10, 25, 50, 100].map(v => (
                        <button key={v} type="button" onClick={() => setTipAmt(v)}
                          className="flex-1 text-xs py-1 rounded bg-secondary border border-border font-mono hover:border-primary/40 transition-colors">
                          ${v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={sendTip}
                    disabled={tipLoading || !tipTo.trim() || tipAmt <= 0 || tipAmt > dashboard.promoBalance}
                    className="w-full h-10 rounded-md bg-primary text-primary-foreground font-bold uppercase tracking-widest text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <Gift className="w-4 h-4" />
                    {tipLoading ? "Sending…" : `Send ${formatCurrency(tipAmt)} Promo`}
                  </button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* About Tab (non-creator) */}
        {!isCreator && (
          <TabsContent value="about" className="mt-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-6 space-y-4">
                <h3 className="font-display font-black uppercase tracking-widest text-lg">Become a Creator</h3>
                <p className="text-muted-foreground text-sm">
                  Creator accounts get access to the Creator DGC Bank — promo credits funded by the platform for streaming and community events. No real money involved, just tools to grow your community.
                </p>
                <p className="text-muted-foreground text-sm">
                  Contact the platform owner to apply for a creator account. Anyone can use the referral system.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
