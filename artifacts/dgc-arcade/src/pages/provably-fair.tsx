import { Link } from "wouter";
import { ChevronLeft, ShieldCheck, Cpu, Lock, Info, Zap, Dice6, Spade, TrendingUp } from "lucide-react";

export default function ProvablyFairPage() {
  const games = [
    {
      name: "Blackjack",
      algorithm: "SHA-256",
      description: "Deck is shuffled using combined Server Seed, Client Seed, and Nonce. Card order is locked before the first card is dealt.",
      icon: Spade,
      color: "from-red-500/20 to-transparent"
    },
    {
      name: "Crash",
      algorithm: "SHA-256",
      description: "Crash multiplier is determined by hashing combined seeds (serverSeed:clientSeed:nonce:crash). The outcome is locked before the game starts.",
      icon: TrendingUp,
      color: "from-orange-500/20 to-transparent"
    },
    {
      name: "Chicken Road",
      algorithm: "HMAC-SHA512",
      description: "Hazard positions are generated using HMAC-SHA512 from Server Seed, Client Seed, and Nonce. Fisher-Yates shuffle determines safe path.",
      icon: Zap,
      color: "from-yellow-500/20 to-transparent"
    },
    {
      name: "Mines",
      algorithm: "HMAC-SHA512",
      description: "Mine positions are generated using HMAC-SHA512 from Server Seed, Client Seed, and Nonce. Random byte stream determines which tiles contain mines before you start clicking.",
      icon: Cpu,
      color: "from-purple-500/20 to-transparent"
    },
    {
      name: "Dice",
      algorithm: "SHA-256",
      description: "Dice roll result is determined by hashing combined seeds. Result is locked before you roll.",
      icon: Dice6,
      color: "from-blue-500/20 to-transparent"
    },
    {
      name: "Hi-Lo",
      algorithm: "SHA-256",
      description: "Next card value is determined by hashing combined seeds. Card is locked before you guess higher or lower.",
      icon: TrendingUp,
      color: "from-green-500/20 to-transparent"
    },
    {
      name: "Keno",
      algorithm: "SHA-256",
      description: "Winning numbers are determined by hashing combined seeds. All numbers are locked before you select your picks.",
      icon: Cpu,
      color: "from-indigo-500/20 to-transparent"
    },
    {
      name: "Coinflip",
      algorithm: "SHA-256",
      description: "Coin result (heads/tails) is determined by hashing combined seeds. Result is locked before the flip animation.",
      icon: Zap,
      color: "from-cyan-500/20 to-transparent"
    },
    {
      name: "Roulette",
      algorithm: "SHA-256",
      description: "Winning number is determined by hashing combined seeds. Wheel result is locked before spin begins.",
      icon: Cpu,
      color: "from-pink-500/20 to-transparent"
    },
    {
      name: "Horse Race",
      algorithm: "SHA-256",
      description: "Race outcomes are determined by hashing combined seeds. Winner is locked before the race starts.",
      icon: TrendingUp,
      color: "from-amber-500/20 to-transparent"
    }
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-16">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> Home
        </Link>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-6 mb-12">
        <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/30 shadow-[0_0_30px_rgba(var(--primary),0.2)]">
          <ShieldCheck className="w-10 h-10 text-primary" />
        </div>
        <div>
          <h1 className="text-4xl md:text-5xl font-display font-black uppercase tracking-tighter mb-2">
            Provably Fair <span className="text-primary">Gaming</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Mathematical proof that every outcome is 100% random and never manipulated. Verify every single game in real-time.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        <div className="bg-secondary/20 border border-border/40 p-6 rounded-2xl">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center mb-4">
            <Lock className="w-5 h-5 text-blue-400" />
          </div>
          <h3 className="font-bold text-foreground mb-2 uppercase tracking-wide">Locked In</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            The game outcome is generated and hashed BEFORE you place your bet. We can't change it.
          </p>
        </div>
        <div className="bg-secondary/20 border border-border/40 p-6 rounded-2xl">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center mb-4">
            <Cpu className="w-5 h-5 text-purple-400" />
          </div>
          <h3 className="font-bold text-foreground mb-2 uppercase tracking-wide">Military Grade</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We use SHA-256 and HMAC-SHA512 — the same cryptographic standards trusted by Bitcoin and the NSA.
          </p>
        </div>
        <div className="bg-secondary/20 border border-border/40 p-6 rounded-2xl">
          <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center mb-4">
            <ShieldCheck className="w-5 h-5 text-green-400" />
          </div>
          <h3 className="font-bold text-foreground mb-2 uppercase tracking-wide">Player Verified</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            You get a unique verification link after every hand to see the mathematical proof yourself.
          </p>
        </div>
      </div>

      <div className="prose prose-invert max-w-none space-y-12">
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-6 w-1 bg-primary rounded-full" />
            <h2 className="text-2xl font-display font-bold uppercase tracking-tight m-0">All Games — All Fair</h2>
          </div>
          <p className="text-muted-foreground mb-6">
            Every game on DGC Arcade uses cryptographic verification. Click on any game to verify your results in real-time.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {games.map((game) => {
              const Icon = game.icon;
              return (
                <div key={game.name} className="bg-secondary/10 border border-border/30 rounded-xl p-5 hover:border-primary/50 transition-colors">
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${game.color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-foreground font-bold mb-1">{game.name}</h4>
                      <span className="text-xs font-mono bg-primary/20 text-primary px-2 py-1 rounded">
                        {game.algorithm}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {game.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-6 w-1 bg-primary rounded-full" />
            <h2 className="text-2xl font-display font-bold uppercase tracking-tight m-0">Cryptographic Standards</h2>
          </div>
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 mb-6">
            <p className="text-muted-foreground leading-relaxed m-0">
              We use <strong className="text-foreground">SHA-256</strong> and <strong className="text-foreground">HMAC-SHA512</strong> to ensure every game outcome is verifiable. These are global cryptographic standards trusted by Bitcoin, Ethereum, and the NSA.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-secondary/10 p-5 rounded-xl border border-border/30">
              <h4 className="text-foreground font-bold mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                SHA-256 (Blackjack, Crash, Dice, Hi-Lo, Keno, Coinflip, Roulette, Horse Race)
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Hashing algorithm that commits to a game state before play begins. The outcome is locked in and mathematically impossible to change. Used by Bitcoin and the NSA.
              </p>
            </div>
            <div className="bg-secondary/10 p-5 rounded-xl border border-border/30">
              <h4 className="text-foreground font-bold mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-400" />
                HMAC-SHA512 (Chicken Road, Mines)
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Generates a random byte stream from Server Seed, Client Seed, and Nonce. Used to shuffle hazards and determine tile positions with Fisher-Yates algorithm.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-secondary/10 border border-border/30 rounded-3xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <Info className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-display font-bold uppercase tracking-tight m-0">How Verification Works</h2>
          </div>
          
          <div className="space-y-8">
            <div className="flex gap-6">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary flex-shrink-0">1</div>
              <div>
                <h4 className="text-foreground font-bold mb-1">Pre-Game Commitment</h4>
                <p className="text-sm text-muted-foreground">
                  Before you click "Deal", "Roll", or "Spin", the server generates a <strong className="text-foreground">Server Seed</strong>. We show you the SHA-256 hash of this seed immediately. Because you have the hash, you know the outcome is already locked in and cannot be changed.
                </p>
              </div>
            </div>

            <div className="flex gap-6">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary flex-shrink-0">2</div>
              <div>
                <h4 className="text-foreground font-bold mb-1">Your Contribution (Client Seed)</h4>
                <p className="text-sm text-muted-foreground">
                  You provide a <strong className="text-foreground">Client Seed</strong> (which you can change at any time). This ensures the server cannot predict exactly how the final result will be calculated, as it doesn't know your seed until the bet is placed. This is your guarantee of fairness.
                </p>
              </div>
            </div>

            <div className="flex gap-6">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary flex-shrink-0">3</div>
              <div>
                <h4 className="text-foreground font-bold mb-1">Post-Game Revelation</h4>
                <p className="text-sm text-muted-foreground">
                  After the game ends, we reveal the original <strong className="text-foreground">Server Seed</strong>. You can then hash this seed yourself using any SHA-256 tool. If the hash matches the one we showed you before the game, you have 100% mathematical proof that the result was not changed.
                </p>
              </div>
            </div>

            <div className="flex gap-6">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary flex-shrink-0">4</div>
              <div>
                <h4 className="text-foreground font-bold mb-1">One-Click Verification</h4>
                <p className="text-sm text-muted-foreground">
                  We provide a one-click verify button on every bet in your history. On mobile and web, you can instantly verify any game result. No technical knowledge required — we handle the cryptography for you.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 pt-8 border-t border-border/30">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h4 className="text-foreground font-bold mb-1 uppercase text-sm">Ready to Play Fair?</h4>
                <p className="text-xs text-muted-foreground">Every game is verified. Every result is provable. Every win is yours.</p>
              </div>
              <Link href="/games" className="px-6 py-2 bg-primary text-primary-foreground font-bold rounded-xl hover:scale-105 transition-transform uppercase text-xs">
                Play Fair Games
              </Link>
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-6 w-1 bg-primary rounded-full" />
            <h2 className="text-2xl font-display font-bold uppercase tracking-tight m-0">Verify on Mobile & Web</h2>
          </div>
          <p className="text-muted-foreground mb-6">
            Whether you're on your phone or desktop, you can verify any game result instantly. We provide both mobile and web interfaces for verification — no technical setup required.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-secondary/10 p-6 rounded-xl border border-border/30">
              <h4 className="text-foreground font-bold mb-3">📱 Mobile Verification</h4>
              <ul className="text-xs text-muted-foreground space-y-2">
                <li>✓ Tap any game in your history</li>
                <li>✓ Click "Verify" button</li>
                <li>✓ See instant proof of fairness</li>
                <li>✓ No scrolling or blocking</li>
              </ul>
            </div>
            <div className="bg-secondary/10 p-6 rounded-xl border border-border/30">
              <h4 className="text-foreground font-bold mb-3">💻 Web Verification</h4>
              <ul className="text-xs text-muted-foreground space-y-2">
                <li>✓ Click verify on any bet</li>
                <li>✓ See full cryptographic details</li>
                <li>✓ Download verification proof</li>
                <li>✓ Share with others</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
