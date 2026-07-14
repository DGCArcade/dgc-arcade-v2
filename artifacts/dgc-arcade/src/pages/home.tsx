import { useState, useEffect } from "react";
import { PlatformStats } from "@/components/home/stats";
import { LiveFeed } from "@/components/home/live-feed";
import { GameCard } from "@/components/games/game-card";
import { useListGames, getListGamesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useAuthModal } from "@/hooks/use-auth-modal";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { formatCurrency } from "@/lib/format";
import { Zap, TrendingUp, Shield, ChevronRight, Trophy, Clock, Target } from "lucide-react";
import { getApiUrl } from "@/lib/api-fetch";

const FEATURES = [
  {
    icon: Zap,
    title: "Instant Payouts",
    desc: "Withdraw winnings to your wallet in seconds. No delays, no paperwork.",
    link: "/instant-payouts",
    detail: "Automated processing via Plisio. Most withdrawals are confirmed on-chain within 10 minutes."
  },
  {
    icon: TrendingUp,
    title: "Provably Fair",
    desc: "Every result is cryptographically verifiable. The math doesn't lie.",
    link: "/provably-fair",
    detail: "Uses SHA-256 hashing. You can verify every single bet against our server seed after the game."
  },
  {
    icon: Shield,
    title: "Crypto Native",
    desc: "Deposit and withdraw with Bitcoin, Ethereum, USDT and more.",
    link: "/crypto-native",
    detail: "No banks, no limits. We support BTC, ETH, LTC, USDT, and more for ultimate financial freedom."
  },
];

// ── Live Jackpot Banner ────────────────────────────────────────────────────────
interface LiveJackpots { mini: number; minor: number; major: number; grand: number }
function LiveJackpotBanner() {
  const [vals, setVals] = useState<LiveJackpots>({ mini: 50, minor: 250, major: 1250, grand: 5000 });
  useEffect(() => {
    const fetch_ = () =>
      fetch(getApiUrl("/api/jackpot"))
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setVals(d); })
        .catch(() => {});
    fetch_();
    // Poll every 5 seconds — only real data from the DB, no fake animation tick
    const iv = window.setInterval(fetch_, 10_000);
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
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          Every settled bet feeds these live pools automatically. Each bet also rolls a provably-fair jackpot chance; larger wagers improve the odds up to the jackpot cap, and a winning tier resets to its seed after payout.
        </p>
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
function getOnlineVisitorId(): string {
  const key = "dgc_online_visitor_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(key, id);
  return id;
}

async function sendOnlineHeartbeat() {
  const visitorId = getOnlineVisitorId();
  await fetch(getApiUrl("/api/stats/heartbeat"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-visitor-fingerprint": visitorId,
    },
    body: JSON.stringify({
      visitorId,
      path: window.location.pathname,
    }),
  });
}

function LiveOnlineCount() {
  const [online, setOnline] = useState<number | null>(null);
  useEffect(() => {
    let mounted = true;
    const fetch_ = async () => {
      await sendOnlineHeartbeat().catch(() => {});
      fetch(getApiUrl("/api/stats/live"))
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d && mounted) setOnline(d.onlineNow); })
        .catch(() => {});
    };
    fetch_();
    const iv = window.setInterval(fetch_, 10_000);
    const onFocus = () => fetch_();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      mounted = false;
      window.clearInterval(iv);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
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

// ── Live Tournament Card ──────────────────────────────────────────────────────
interface Tournament {
  id: number;
  name: string;
  description?: string | null;
  prize: number;
  status: "active" | "upcoming" | "ended";
  startAt: string;
  endAt: string;
}

interface TournamentLeader {
  rank: number;
  username: string;
  score: number;
}

function formatTimeLeft(target: string): string {
  const ms = new Date(target).getTime() - Date.now();
  if (ms <= 0) return "ending soon";
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h left`;
  if (hours > 0) return `${hours}h ${minutes % 60}m left`;
  return `${Math.max(1, minutes)}m left`;
}

function TournamentPulse() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [leaders, setLeaders] = useState<TournamentLeader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(getApiUrl("/api/tournaments"));
        const data = res.ok ? await res.json() as Tournament[] : [];
        setTournaments(Array.isArray(data) ? data : []);
        const active = Array.isArray(data) ? data.find(t => t.status === "active") : null;
        if (active) {
          const lb = await fetch(getApiUrl(`/api/tournaments/${active.id}/leaderboard`));
          const lbData = lb.ok ? await lb.json() : null;
          setLeaders(Array.isArray(lbData?.leaderboard) ? lbData.leaderboard.slice(0, 3) : []);
        } else {
          setLeaders([]);
        }
      } catch {
        setTournaments([]);
        setLeaders([]);
      } finally {
        setLoading(false);
      }
    };
    load();
    const iv = window.setInterval(load, 15_000);
    return () => window.clearInterval(iv);
  }, []);

  const tournament =
    tournaments.find(t => t.status === "active") ??
    tournaments.find(t => t.status === "upcoming") ??
    tournaments[0];

  const isActive = tournament?.status === "active";

  return (
    <div className="rounded-2xl border border-primary/20 bg-card/90 p-5 shadow-[0_0_40px_rgba(255,215,0,0.08)]">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-primary mb-2">
            <Trophy className="w-4 h-4" />
            Live Tournament
          </div>
          <h3 className="font-display font-black text-2xl uppercase tracking-tight">
            {loading ? "Checking tournaments…" : tournament?.name ?? "No active tournament"}
          </h3>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest border ${
          isActive ? "text-green-400 border-green-500/30 bg-green-500/10" : "text-yellow-300 border-yellow-500/30 bg-yellow-500/10"
        }`}>
          {tournament?.status ?? "standby"}
        </span>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed mb-4">
        {tournament?.description ??
          "When a tournament is active, participation is automatic: log in, play eligible games, and every wager adds to your tournament score. The highest wagered total leads the board."}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl border border-border/40 bg-secondary/30 p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-widest mb-1">
            <Trophy className="w-3.5 h-3.5" /> Prize
          </div>
          <div className="font-mono font-black text-lg text-primary">
            {formatCurrency(tournament?.prize ?? 0)}
          </div>
        </div>
        <div className="rounded-xl border border-border/40 bg-secondary/30 p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-widest mb-1">
            <Clock className="w-3.5 h-3.5" /> Time
          </div>
          <div className="font-mono font-black text-lg">
            {tournament ? formatTimeLeft(isActive ? tournament.endAt : tournament.startAt) : "standby"}
          </div>
        </div>
        <div className="rounded-xl border border-border/40 bg-secondary/30 p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-widest mb-1">
            <Target className="w-3.5 h-3.5" /> Score
          </div>
          <div className="font-mono font-black text-lg">Total wagered</div>
        </div>
      </div>

      {leaders.length > 0 ? (
        <div className="space-y-2 mb-4">
          {leaders.map((leader) => (
            <div key={leader.rank} className="flex items-center justify-between rounded-lg bg-secondary/30 border border-border/30 px-3 py-2 text-sm">
              <span className="font-bold">#{leader.rank} {leader.username}</span>
              <span className="font-mono text-primary">{formatCurrency(leader.score)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/50 bg-secondary/20 p-4 text-sm text-muted-foreground mb-4">
          {isActive ? "No leaderboard entries yet. First wagers will appear here live." : "The next active tournament will appear here automatically."}
        </div>
      )}

      <div className="text-xs text-muted-foreground leading-relaxed">
        How to participate: sign in, play while a tournament is active, and every settled wager updates your score automatically. No manual entry is needed.
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function Home() {
  const { data: games } = useListGames({ query: { queryKey: getListGamesQueryKey() } });
  const authModal = useAuthModal();
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const [featuredGames, setFeaturedGames] = useState<any[]>([]);

  useEffect(() => {
    if (Array.isArray(games)) {
      const active = games.filter((g) => g.active);
      // Shuffle and pick 4 games for mobile (2x2 grid) or 3 for desktop
      const shuffled = [...active].sort(() => 0.5 - Math.random());
      setFeaturedGames(shuffled.slice(0, 4));
    }
  }, [games]);

  return (
    <div className="space-y-16 pb-16">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative rounded-2xl overflow-hidden border border-border/20 min-h-[440px] flex items-center bg-secondary/10">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(circle at 82% 18%, var(--theme-glow-strong, rgba(255,215,0,0.18)), transparent 55%), radial-gradient(circle at 15% 85%, var(--theme-glow, rgba(255,215,0,0.07)), transparent 50%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background/60 via-background/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/30 via-transparent to-transparent" />

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
            High-stakes crypto gaming.<br />
            Provably fair · Instant payouts · No BS.
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {featuredGames.length === 0
            ? [1, 2, 3, 4].map((i) => (
                <div key={i} className="aspect-[3/4.2] lg:aspect-[4/5] bg-secondary/60 animate-pulse rounded-xl border border-border/40" />
              ))
            : featuredGames.map((game) => (
                <div key={game.id} className="h-full">
                  <GameCard game={game} />
                </div>
              ))}
        </div>
      </section>

      {/* ── Feature callouts ─────────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            role="button"
            onClick={() => setLocation(f.link)}
            className="rounded-xl border border-border/40 bg-secondary/30 p-6 flex flex-col gap-4 hover:border-primary/40 hover:bg-secondary/50 transition-all card-hover-glow backdrop-blur-sm cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <f.icon className="w-5 h-5 text-primary" />
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg uppercase tracking-wider mb-1 group-hover:text-primary transition-colors">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">{f.desc}</p>
              <div className="pt-3 border-t border-border/20">
                <p className="text-[10px] text-muted-foreground/60 uppercase font-black tracking-widest leading-tight group-hover:text-muted-foreground transition-colors">
                  {f.detail}
                </p>
              </div>
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
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.1fr] gap-6 items-start">
          <LiveJackpotBanner />
          <TournamentPulse />
        </div>
      </section>
    </div>
  );
}
