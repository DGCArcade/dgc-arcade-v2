import { useState } from "react";
import { X, ChevronRight, Crown, Zap, Gift, Star, TrendingUp, MessageCircle, Lock } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";

export const VIP_TIERS = [
  { id: 0, name: "ROOKIE GRINDER",  shortName: "Rookie",  min: 0,         rakebackPct: 5,  color: "#cd7f32", icon: "🥉" },
  { id: 1, name: "CREW MEMBER",     shortName: "Crew",    min: 1_000,      rakebackPct: 8,  color: "#94a3b8", icon: "⚡" },
  { id: 2, name: "GOLD STATUS",     shortName: "Gold",    min: 10_000,     rakebackPct: 12, color: "#fbbf24", icon: "🥇" },
  { id: 3, name: "STREET LEGEND",   shortName: "Legend",  min: 50_000,     rakebackPct: 14, color: "#22d3ee", icon: "🌟" },
  { id: 4, name: "DGC OG",          shortName: "OG",      min: 100_000,    rakebackPct: 17, color: "#a855f7", icon: "👑" },
  { id: 5, name: "GRIND ELITE",     shortName: "Elite",   min: 250_000,    rakebackPct: 21, color: "#ec4899", icon: "💎" },
  { id: 6, name: "DIFFERENT LEVEL", shortName: "Diff",    min: 500_000,    rakebackPct: 26, color: "#f97316", icon: "🔥" },
  { id: 7, name: "DIAMOND GRINDER", shortName: "Diamond", min: 1_000_000,  rakebackPct: 30, color: "#00f5ff", icon: "💠" },
];

export function getVipTier(totalWagered: number) {
  return VIP_TIERS.slice().reverse().find(t => totalWagered >= t.min) ?? VIP_TIERS[0];
}

export function getVipProgress(totalWagered: number) {
  const tier = getVipTier(totalWagered);
  const next = VIP_TIERS[tier.id + 1] ?? null;
  if (!next) return { tier, next: null, pct: 100, remaining: 0 };
  const pct = Math.min(100, ((totalWagered - tier.min) / (next.min - tier.min)) * 100);
  return { tier, next, pct, remaining: Math.max(0, next.min - totalWagered) };
}

interface VipModalProps { open: boolean; onClose: () => void; }

export function VipModal({ open, onClose }: VipModalProps) {
  const { user } = useAuth();
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "tiers">("overview");

  const wagered = (user as any)?.totalWageredAmount ?? 0;
  const rakebackClaimed = (user as any)?.rakebackClaimed ?? 0;
  const { tier, next, pct, remaining } = getVipProgress(wagered);
  const claimable = Math.max(0, wagered * (tier.rakebackPct / 100) - rakebackClaimed);

  async function claimRakeback() {
    setClaiming(true); setClaimMsg(null);
    try {
      const token = localStorage.getItem("dgc_token");
      const res = await fetch("/api/users/me/rakeback/claim", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) { setClaimMsg(d.error ?? "Claim failed"); return; }
      setClaimMsg(`✅ Claimed ${formatCurrency(d.claimed)}!`);
      setTimeout(() => window.location.reload(), 1200);
    } catch { setClaimMsg("Network error"); }
    finally { setClaiming(false); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        <button onClick={onClose} className="absolute top-4 right-4 z-10 text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="relative p-6 pb-4 flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${tier.color}18 0%, transparent 60%)`, borderBottom: `1px solid ${tier.color}30` }}>
          <div className="absolute inset-0 opacity-5 pointer-events-none"
            style={{ backgroundImage: `radial-gradient(circle at 80% 50%, ${tier.color} 0%, transparent 60%)` }} />
          <div className="relative">
            <div className="text-4xl mb-1">{tier.icon}</div>
            <h2 className="font-display font-black text-2xl uppercase tracking-widest" style={{ color: tier.color }}>{tier.name}</h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{formatCurrency(wagered)} wagered total</p>
          </div>
          {next ? (
            <div className="mt-4">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                <span style={{ color: tier.color }}>{tier.shortName}</span>
                <span>{pct.toFixed(1)}%</span>
                <span style={{ color: next.color }}>{next.shortName}</span>
              </div>
              <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${tier.color}, ${next.color})` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                {formatCurrency(remaining)} more to <span style={{ color: next.color }}>{next.name}</span>
              </p>
            </div>
          ) : (
            <div className="mt-3 text-xs font-bold uppercase tracking-widest" style={{ color: tier.color }}>
              💠 MAX TIER — Diamond Grinder
            </div>
          )}
        </div>

        <div className="flex border-b border-border flex-shrink-0">
          {(["overview", "tiers"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${tab === t ? "text-primary border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"}`}>
              {t}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          {tab === "overview" && (
            <>
              <div className="rounded-xl border border-border/60 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <span className="font-bold uppercase tracking-widest text-sm">Rakeback</span>
                  <span className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-full font-bold">{tier.rakebackPct}% rate</span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">Available to claim</div>
                    <div className="font-mono font-black text-2xl" style={{ color: claimable > 0 ? tier.color : undefined }}>{formatCurrency(claimable)}</div>
                  </div>
                  <button onClick={claimRakeback} disabled={claiming || claimable < 0.01}
                    className="px-5 py-2 rounded-lg font-bold uppercase tracking-widest text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed border"
                    style={{ background: claimable >= 0.01 ? tier.color : "transparent", color: claimable >= 0.01 ? "#000" : undefined, borderColor: tier.color }}>
                    {claiming ? "Claiming…" : "Claim"}
                  </button>
                </div>
                {claimMsg && <p className="text-xs font-mono" style={{ color: tier.color }}>{claimMsg}</p>}
                <p className="text-xs text-muted-foreground font-mono">{formatCurrency(wagered)} wagered × {tier.rakebackPct}% — {formatCurrency(rakebackClaimed)} claimed</p>
              </div>

              <div className="rounded-xl border border-border/60 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Gift className="w-5 h-5 text-green-400" />
                  <div>
                    <div className="font-bold uppercase tracking-widest text-sm">Daily Bonus</div>
                    <div className="text-xs text-muted-foreground">Free daily reload — available to all members</div>
                  </div>
                </div>
                <button onClick={onClose} className="flex items-center gap-1 text-xs text-green-400 font-bold uppercase tracking-widest hover:text-green-300 transition-colors">
                  Claim <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="rounded-xl border border-border/60 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-yellow-400" />
                  <div>
                    <div className="font-bold uppercase tracking-widest text-sm">Weekly Boost</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      {tier.id >= 2 ? "Active — based on your weekly wager volume" : <><Lock className="w-3 h-3" /> Unlocks at Gold Status</>}
                    </div>
                  </div>
                </div>
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: tier.id >= 2 ? "#fbbf24" : undefined }}>
                  {tier.id >= 2 ? "✓ Active" : <span className="text-muted-foreground">Locked</span>}
                </span>
              </div>

              <div className="rounded-xl border border-border/60 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Star className="w-5 h-5 text-purple-400" />
                  <div>
                    <div className="font-bold uppercase tracking-widest text-sm">Monthly Bonus</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      {tier.id >= 3 ? "Sent automatically by your VIP host" : <><Lock className="w-3 h-3" /> Unlocks at Street Legend</>}
                    </div>
                  </div>
                </div>
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: tier.id >= 3 ? "#a855f7" : undefined }}>
                  {tier.id >= 3 ? "✓ Active" : <span className="text-muted-foreground">Locked</span>}
                </span>
              </div>

              <div className="rounded-xl border border-border/60 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-cyan-400" />
                  <div>
                    <div className="font-bold uppercase tracking-widest text-sm">Balance Top-Up</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      {tier.id >= 2 ? "Emergency reload — contact VIP support" : <><Lock className="w-3 h-3" /> Unlocks at Gold Status</>}
                    </div>
                  </div>
                </div>
                {tier.id >= 2 ? (
                  <a href="https://t.me/dgcarcade" target="_blank" rel="noopener" className="flex items-center gap-1 text-xs text-cyan-400 font-bold uppercase tracking-widest hover:text-cyan-300 transition-colors">
                    <MessageCircle className="w-3.5 h-3.5" /> Request
                  </a>
                ) : <span className="text-xs text-muted-foreground font-bold uppercase">Locked</span>}
              </div>

              <div className="rounded-xl border border-border/60 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Crown className="w-5 h-5 text-amber-400" />
                  <div>
                    <div className="font-bold uppercase tracking-widest text-sm">Dedicated VIP Host</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      {tier.id >= 4 ? "Your personal DGC account manager" : <><Lock className="w-3 h-3" /> Unlocks at DGC OG ($100K wagered)</>}
                    </div>
                  </div>
                </div>
                {tier.id >= 4 ? (
                  <a href="https://t.me/dgcarcade" target="_blank" rel="noopener" className="flex items-center gap-1 text-xs text-amber-400 font-bold uppercase tracking-widest hover:text-amber-300 transition-colors">
                    <MessageCircle className="w-3.5 h-3.5" /> Telegram
                  </a>
                ) : <span className="text-xs text-muted-foreground font-bold uppercase">Locked</span>}
              </div>
            </>
          )}

          {tab === "tiers" && (
            <div className="space-y-2">
              {VIP_TIERS.map(t => (
                <div key={t.id}
                  className={`rounded-xl p-3 border transition-all ${t.id === tier.id ? "border-2 shadow-sm" : "border-border/50 opacity-70 hover:opacity-90"}`}
                  style={{ borderColor: t.id === tier.id ? t.color : undefined, background: t.id === tier.id ? t.color + "10" : undefined }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{t.icon}</span>
                      <div>
                        <div className="font-bold uppercase tracking-widest text-sm flex items-center gap-2">
                          <span style={{ color: t.id === tier.id ? t.color : undefined }}>{t.name}</span>
                          {t.id === tier.id && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-black" style={{ background: t.color + "30", color: t.color }}>YOU</span>}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {t.min === 0 ? "Starting tier — everyone starts here" : `${formatCurrency(t.min)} total wagered`}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-mono font-black text-lg" style={{ color: t.color }}>{t.rakebackPct}%</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Rakeback</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
