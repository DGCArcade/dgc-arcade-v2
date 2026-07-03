import { Zap, Clock, ShieldCheck, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function InstantPayouts() {
  const [, setLocation] = useLocation();

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 space-y-16">
      {/* Hero Section */}
      <section className="text-center space-y-6">
        <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-full px-4 py-1.5 mb-4">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-widest text-primary">Platform Core Feature</span>
        </div>
        <h1 className="font-display font-black text-4xl md:text-6xl uppercase tracking-tighter leading-none">
          Instant <span className="text-glow-shift">Payouts</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          At DGC Arcade, we believe your winnings belong to you. Our automated withdrawal system ensures you get paid in seconds, not days.
        </p>
      </section>

      {/* The Tech Section */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <h2 className="font-display font-bold text-3xl uppercase tracking-tight">The Technology Behind the Speed</h2>
          <p className="text-muted-foreground leading-relaxed">
            We've integrated directly with the Plisio API and our own proprietary wallet management system to bypass traditional banking delays. When you click "Withdraw," our backend instantly verifies your balance and triggers an on-chain transaction.
          </p>
          <ul className="space-y-4">
            {[
              "Zero manual intervention for standard withdrawals",
              "Direct integration with BTC, ETH, and LTC nodes",
              "Automated gas fee optimization for fast confirmations",
              "Real-time transaction tracking directly in your dashboard"
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-3 text-sm font-medium">
                <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative rounded-2xl overflow-hidden border border-border/40 bg-secondary/20 p-8 aspect-square flex flex-col justify-center gap-8">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Typical Processing Time</div>
            <div className="text-5xl font-mono font-black text-primary">0.4s</div>
            <div className="text-xs text-muted-foreground italic">Internal verification & broadcast</div>
          </div>
          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">On-Chain Confirmation</div>
            <div className="text-5xl font-mono font-black text-primary">~10m</div>
            <div className="text-xs text-muted-foreground italic">Dependent on network congestion</div>
          </div>
        </div>
      </section>

      {/* Safety Section */}
      <section className="rounded-3xl border border-primary/20 bg-card/50 p-8 md:p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-8 items-center">
          <div className="space-y-4">
            <ShieldCheck className="w-12 h-12 text-primary" />
            <h3 className="font-display font-bold text-2xl uppercase tracking-tight">Security First</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              While we prioritize speed, we never compromise on security. Every withdrawal undergoes an automated 256-point risk check to protect your funds from unauthorized access.
            </p>
          </div>
          <div className="hidden md:block w-px h-32 bg-border/40" />
          <div className="space-y-4">
            <Clock className="w-12 h-12 text-primary" />
            <h3 className="font-display font-bold text-2xl uppercase tracking-tight">24/7 Availability</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Our payout system never sleeps. Whether it's 3 AM on a Tuesday or a holiday weekend, your funds are always accessible. No bank holidays, no waiting for "business hours."
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="text-center py-8">
        <Button 
          size="lg" 
          className="font-bold uppercase tracking-widest px-12 py-8 text-lg btn-pulse shadow-[0_0_30px_rgba(255,215,0,0.2)]"
          onClick={() => setLocation("/games")}
        >
          Win & Withdraw Now
          <ArrowRight className="ml-2 w-6 h-6" />
        </Button>
      </section>
    </div>
  );
}
