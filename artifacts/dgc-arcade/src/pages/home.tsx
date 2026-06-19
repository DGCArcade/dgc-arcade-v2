import { useState, useEffect } from "react";
import { PlatformStats } from "@/components/home/stats";
import { LiveFeed } from "@/components/home/live-feed";
import { GameCard } from "@/components/games/game-card";
import { useListGames, getListGamesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useAuthModal } from "@/hooks/use-auth-modal";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Zap, TrendingUp, Shield, ChevronRight, Users } from "lucide-react";

const FEATURES = [
  {
    icon: Zap,
    title: "Instant Payouts",
    desc: "Withdraw winnings to your wallet in seconds. No delays, no paperwork.",
  },
  {
    icon: TrendingUp,
    title: "Provably Fair",
    desc: "Every result is cryptographically verifiable. The math doesn't lie.",
  },
  {
    icon: Shield,
    title: "Crypto Native",
    desc: "Deposit and withdraw with Bitcoin, Ethereum, USDT and more.",
  },
];

// ── Live Jackpot Banner ────────────────────────────────────────────────────────
interface LiveJackpots { mini: number; minor: number; major: number; grand: number }
function LiveJackpotBanner() {
  const [vals, setVals] = useState<LiveJackpots>({ mini: 50, minor: 250, major: 1250, grand: 5000 });
  useEffect(() => {
    const fetch_ = () =>
      fetch("/api/jackpot")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setVals(d); })
        .catch(() => {});
    fetch_();
    // Poll every 5 seconds — only real data from the DB, no fake animation tick
    const iv = window.setInterval(fetch_, 5000);
    return () => { window.clearInterval(iv); };
  }, []);
  const tiers = [
    { key: "mini"  as const, label: "MINI",  color: "#88EEFF" },
    { key: "minor" as const, label: "MINOR", color: "#AAFFAA" },
    { key: "major" as const, label: "MAJOR", color: "#FFDD44" },
    { key: "grand" as const, label: "GRAND", color: "#FF6600" },
  ];
  return (
    <div
      className="w-full rounded-2xl overflow-hidden relative"
      style={{
        background: "linear-gradient(135deg, #0a0015 0%, #050020 50%, #0a0015 100%)",
        border: "1.5px solid rgba(204,0,255,0.35)",
        boxShadow: "0 0 60px rgba(204,0,255,0.12)",
      }}
    >
      {/* Background sweep */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at 50% 0%, rgba(204,0,255,0.18) 0%, transparent 65%)",
            animation: "jbSweep 4s ease-in-out infinite",
          }}
        />
      </div>
      <div className="relative z-10 px-4 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: "#CC00FF", boxShadow: "0 0 8px #CC00FF", animation: "jbDot 1.6s ease-in-out infinite" }}
            />
            <span
              className="font-black text-xs uppercase tracking-[0.22em]"
              style={{ color: "#CC00FF", textShadow: "0 0 10px #CC00FF" }}
            >
              Live Jackpot Pool
            </span>
          </div>
          <span className="text-xs text-muted-foreground font-mono tracking-wider">Platform-Wide</span>
        </div>
        {/* Jackpot tiers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {tiers.map(t => (
            <div
              key={t.key}
              className="flex flex-col items-center rounded-xl py-3 px-2"
              style={{
                background: `radial-gradient(ellipse at 50% 0%, ${t.color}1a 0%, rgba(0,0,0,0.6) 80%)`,
                border:     `1px solid ${t.color}44`,
                boxShadow:  `0 0 20px ${t.color}18`,
              }}
            >
              <span
                className="font-black text-[10px] tracking-[0.2em] uppercase mb-1"
                style={{ color: t.color, textShadow: `0 0 10px ${t.color}` }}
              >
                {t.label}
              </span>
              <span
                className="font-mono font-black text-lg tabular-nums"
                style={{ color: t.color, textShadow: `0 0 14px ${t.color}` }}
              >
                ${vals[t.key].toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {t.key === "grand" && (
                <span className="text-[9px] font-bold uppercase tracking-widest mt-1" style={{ color: `${t.color}99` }}>
                  jackpot
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes jbSweep { 0%,100%{opacity:0.6;} 50%{opacity:1;} }
        @keyframes jbDot   { 0%,100%{opacity:0.5;} 50%{opacity:1; box-shadow:0 0 14px #CC00FF;} }
      `}</style>
    </div>
  );
}

// ── Live Online Count ──────────────────────────────────────────────────────────
function LiveOnlineCount() {
  const [online, setOnline] = useState<number | null>(null);
  useEffect(() => {
    const fetch_ = () =>
      fetch("/api/stats/live")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setOnline(d.onlineNow); })
        .catch(() => {});
    fetch_();
    const iv = window.setInterval(fetch_, 30_000);
    return () => window.clearInterval(iv);
  }, []);
  if (online === null) return null;
  return (
    <div className="inline-flex items-center gap-1.5 bg-green-500/10 border border-green-500/25 rounded-full px-3 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400 block" style={{ animation: "onlinePulse 2s ease-in-out infinite" }} />
      <span className="text-xs font-bold text-green-400">
        {online.toLocaleString()} online now
      </span>
      <style>{`@keyframes onlinePulse{0%,100%{opacity:0.5;}50%{opacity:1;box-shadow:0 0 8px #4ade80;}}`}</style>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function Home() {
  const { data: games } = useListGames({ query: { queryKey: getListGamesQueryKey() } });
  const authModal = useAuthModal();
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const featuredGames = Array.isArray(games) ? games.filter((g) => g.active).slice(0, 3) : [];

  return (
    <div className="space-y-16 pb-16">
      {/* ── Live Jackpot Banner ───────────────────────────────────────── */}
      <section>
        <LiveJackpotBanner />
      </section>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative rounded-2xl overflow-hidden border border-border/40 min-h-[440px] flex items-center bg-secondary/30">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(circle at 82% 18%, var(--theme-glow-strong, rgba(255,215,0,0.28)), transparent 55%), radial-gradient(circle at 15% 85%, var(--theme-glow, rgba(255,215,0,0.10)), transparent 50%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent" />

        <div className="relative z-10 px-6 md:px-16 py-16 w-full flex flex-col items-center text-center">
          <div className="max-w-2xl w-full flex flex-col items-center">
          <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-full px-4 py-1.5">
              <span className="live-dot w-2 h-2 rounded-full bg-green-400 block" />
              <span className="text-xs font-bold uppercase tracking-widest text-glow-shift">Live • DGC Arcade</span>
            </div>
            <LiveOnlineCount />
          </div>

          <h1 className="font-display font-black text-4xl sm:text-5xl md:text-7xl uppercase tracking-tighter leading-[0.9] mb-6">
            The Streets<br />
            <span className="text-glow-shift">Always Win</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground mb-10 max-w-lg mx-auto leading-relaxed">
            High-stakes crypto gaming. Provably fair · Instant payouts · No BS.
          </p>

          <div className="flex flex-wrap gap-4 justify-center">
            {!isAuthenticated ? (
              <Button
                size="lg"
                className="font-bold uppercase tracking-widest text-base px-8 py-6 btn-pulse shadow-[0_0_24px_rgba(255,215,0,0.3)]"
                onClick={() => authModal.open("register")}
              >
                Start Playing — Free
                <ChevronRight className="ml-1 w-5 h-5" />
              </Button>
            ) : (
              <Button
                size="lg"
                className="font-bold uppercase tracking-widest text-base px-8 py-6 btn-pulse shadow-[0_0_24px_rgba(255,215,0,0.3)]"
                onClick={() => setLocation("/games")}
              >
                Play Now
                <ChevronRight className="ml-1 w-5 h-5" />
              </Button>
            )}
            <Button
              variant="outline"
              size="lg"
              className="font-bold uppercase tracking-widest text-base px-8 py-6 border-border/60 hover:border-primary/40 hover:bg-secondary/60"
              onClick={() => setLocation("/leaderboard")}
            >
              Leaderboard
            </Button>
          </div>
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────── */}
      <section>
        <PlatformStats />
      </section>

      {/* ── Featured Games ───────────────────────────────────────── */}
      <section className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-black text-3xl md:text-4xl uppercase tracking-widest">
              <span className="text-glow-shift-slow">Featured</span> Games
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">Pick your game. Place your bet. Collect.</p>
          </div>
          <Button
            variant="ghost"
            className="text-primary hover:text-primary/80 font-bold uppercase tracking-wider text-sm px-0 gap-1"
            onClick={() => setLocation("/games")}
          >
            View All
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuredGames.length === 0
            ? [1, 2, 3].map((i) => (
                <div key={i} className="aspect-[4/3] bg-secondary/60 animate-pulse rounded-xl border border-border/40" />
              ))
            : featuredGames.map((game) => <GameCard key={game.id} game={game} />)}
        </div>
      </section>

      {/* ── Feature callouts ─────────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-border/40 bg-secondary/30 p-6 flex flex-col gap-4 hover:border-primary/30 transition-colors card-hover-glow backdrop-blur-sm"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <f.icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg uppercase tracking-wider mb-1">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ── Live Feed ────────────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <h2 className="font-display font-bold text-3xl uppercase tracking-widest">Live Action</h2>
          <span className="flex items-center gap-1.5 text-xs font-bold text-green-400 uppercase tracking-widest">
            <span className="live-dot w-1.5 h-1.5 rounded-full bg-green-400 block" />
            Live
          </span>
        </div>
        <LiveFeed />
      </section>
    </div>
  );
}
