import { Link } from "wouter";
import { ChevronLeft, ShieldCheck, Cpu, Lock, Info } from "lucide-react";

export default function ProvablyFairPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
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
            Mathematical proof that every outcome is 100% random and never manipulated.
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
          <h3 className="font-bold text-foreground mb-2 uppercase tracking-wide">SHA-256 Standard</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We use the global cryptographic standard trusted by NSA, Bitcoin, and top-tier banks.
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
          <div className="flex items-center gap-3 mb-4">
            <div className="h-6 w-1 bg-primary rounded-full" />
            <h2 className="text-2xl font-display font-bold uppercase tracking-tight m-0">Our Fair Algorithms</h2>
          </div>
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 mb-6">
            <p className="text-muted-foreground leading-relaxed m-0">
              We use <strong className="text-foreground">SHA-256</strong> and <strong className="text-foreground">HMAC-SHA512</strong> to ensure every game outcome is verifiable. These are global cryptographic standards trusted by Bitcoin and the NSA.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-secondary/10 p-5 rounded-xl border border-border/30">
              <h4 className="text-foreground font-bold mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                Chicken Road & Mines
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Uses <strong className="text-foreground">HMAC-SHA512</strong> to generate a random byte stream from your Server Seed, Client Seed, and Nonce. This stream is used to shuffle the hazards (Fisher-Yates) or pick tile positions.
              </p>
            </div>
            <div className="bg-secondary/10 p-5 rounded-xl border border-border/30">
              <h4 className="text-foreground font-bold mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-400" />
                Blackjack & Crash
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Uses <strong className="text-foreground">SHA-256</strong> hashing to commit to a game state before play begins. For Blackjack, the deck is shuffled using the combined seeds, ensuring the order is fixed before the first card is dealt.
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
                  Before you click "Deal" or "Roll", the server generates a <strong className="text-foreground">Server Seed</strong>. We show you the SHA-256 hash of this seed immediately. Because you have the hash, you know the outcome is already locked in.
                </p>
              </div>
            </div>

            <div className="flex gap-6">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary flex-shrink-0">2</div>
              <div>
                <h4 className="text-foreground font-bold mb-1">Your Contribution (Client Seed)</h4>
                <p className="text-sm text-muted-foreground">
                  You provide a <strong className="text-foreground">Client Seed</strong> (which you can change at any time). This ensures the server cannot predict exactly how the final result will be calculated, as it doesn't know your seed until the bet is placed.
                </p>
              </div>
            </div>

            <div className="flex gap-6">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary flex-shrink-0">3</div>
              <div>
                <h4 className="text-foreground font-bold mb-1">Post-Game Revelation</h4>
                <p className="text-sm text-muted-foreground">
                  After the game ends, we reveal the original <strong className="text-foreground">Server Seed</strong>. You can then hash this seed yourself. If the hash matches the one we showed you before the game, you have 100% mathematical proof that the result was not changed.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 pt-8 border-t border-border/30">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h4 className="text-foreground font-bold mb-1 uppercase text-sm">Automated Verification</h4>
                <p className="text-xs text-muted-foreground">We provide a one-click verify button on every bet history item.</p>
              </div>
              <Link href="/games" className="px-6 py-2 bg-primary text-primary-foreground font-bold rounded-xl hover:scale-105 transition-transform uppercase text-xs">
                Play Fair Games
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
