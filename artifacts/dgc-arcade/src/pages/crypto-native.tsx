import { Shield, Coins, Globe, Lock, Cpu, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function CryptoNative() {
  const [, setLocation] = useLocation();

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 space-y-16">
      {/* Hero Section */}
      <section className="text-center space-y-6">
        <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-full px-4 py-1.5 mb-4">
          <Shield className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-widest text-primary">Decentralized Philosophy</span>
        </div>
        <h1 className="font-display font-black text-4xl md:text-6xl uppercase tracking-tighter leading-none">
          Crypto <span className="text-glow-shift">Native</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Built on the blockchain, for the blockchain. DGC Arcade is a pure crypto-first ecosystem designed for privacy, speed, and global access.
        </p>
      </section>

      {/* Philosophy Section */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          {
            icon: Lock,
            title: "No Middlemen",
            desc: "By removing traditional banks, we remove the limits, the fees, and the intrusive questions."
          },
          {
            icon: Globe,
            title: "Global Access",
            desc: "If you have a wallet, you can play. We transcend borders and banking restrictions."
          },
          {
            icon: Cpu,
            title: "Hard-Coded Trust",
            desc: "Our platform logic is tied directly to cryptographic verification, not human promises."
          }
        ].map((item, i) => (
          <div key={i} className="rounded-2xl border border-border/40 bg-secondary/20 p-6 space-y-4 hover:border-primary/30 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <item.icon className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-display font-bold text-xl uppercase tracking-tight">{item.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </section>

      {/* Assets Section */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div className="relative rounded-2xl overflow-hidden border border-border/40 bg-secondary/20 p-8 aspect-video flex items-center justify-center">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,215,0,0.1),transparent_70%)]" />
          <div className="grid grid-cols-3 gap-6 relative z-10">
            {["BTC", "ETH", "LTC", "USDT", "USDC", "DOGE"].map((coin) => (
              <div key={coin} className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-background border border-border/60 flex items-center justify-center font-mono font-black text-xs text-primary shadow-lg">
                  {coin}
                </div>
                <span className="text-[10px] font-black tracking-widest text-muted-foreground">{coin}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <h2 className="font-display font-bold text-3xl uppercase tracking-tight">Our Asset Ecosystem</h2>
          <p className="text-muted-foreground leading-relaxed">
            We support the world's most trusted cryptocurrencies. Our backend automatically handles exchange rates in real-time, ensuring your bets are always accurate and your winnings are always secure.
          </p>
          <ul className="space-y-4">
            {[
              "Multi-chain deposit support",
              "SegWit and Taproot optimized BTC addresses",
              "ERC-20 and TRC-20 USDT options",
              "Zero-fee internal transfers"
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-3 text-sm font-medium">
                <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Final Callout */}
      <section className="text-center rounded-3xl bg-gradient-to-b from-primary/10 to-transparent border-t border-primary/20 p-12">
        <Coins className="w-16 h-16 text-primary mx-auto mb-6" />
        <h2 className="font-display font-black text-3xl md:text-4xl uppercase tracking-tighter mb-4">The Future of Gaming is Crypto</h2>
        <p className="text-muted-foreground max-w-xl mx-auto mb-8">
          Join the Different Grind Crew and experience the freedom of a truly crypto-native platform.
        </p>
        <Button 
          size="lg" 
          className="font-bold uppercase tracking-widest px-12 py-8 text-lg btn-pulse shadow-[0_0_30px_rgba(255,215,0,0.2)]"
          onClick={() => setLocation("/games")}
        >
          Deposit Crypto Now
          <ArrowRight className="ml-2 w-6 h-6" />
        </Button>
      </section>
    </div>
  );
}
