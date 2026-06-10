import { PlatformStats } from "@/components/home/stats";
import { LiveFeed } from "@/components/home/live-feed";
import { GameCard } from "@/components/games/game-card";
import { useListGames, getListGamesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useAuthModal } from "@/hooks/use-auth-modal";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Zap, TrendingUp, Shield, ChevronRight } from "lucide-react";

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

export default function Home() {
  const { data: games } = useListGames({ query: { queryKey: getListGamesQueryKey() } });
  const authModal = useAuthModal();
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const featuredGames = Array.isArray(games) ? games.filter((g) => g.active).slice(0, 3) : [];

  return (
    <div className="space-y-20 pb-16">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative rounded-2xl overflow-hidden border border-border/40 min-h-[480px] flex items-center bg-secondary/30">
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
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-full px-4 py-1.5 mb-8">
            <span className="live-dot w-2 h-2 rounded-full bg-green-400 block" />
            <span className="text-xs font-bold uppercase tracking-widest text-glow-shift">Live • Different Grind Crew</span>
          </div>

          <h1 className="font-display font-black text-4xl sm:text-5xl md:text-7xl uppercase tracking-tighter leading-[0.9] mb-6">
            The Streets<br />
            <span className="text-glow-shift">Always Win</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground mb-10 max-w-lg mx-auto leading-relaxed">
            High-stakes crypto gaming built for the Different Grind Crew.
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
