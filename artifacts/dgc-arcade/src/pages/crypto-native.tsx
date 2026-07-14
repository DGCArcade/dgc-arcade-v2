import { Shield, Coins, Globe, Lock, Cpu, CheckCircle2, ArrowRight, Zap, RefreshCcw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function CryptoNative() {
  const [, setLocation] = useLocation();

  return (
    <div className="max-w-7xl mx-auto py-8 md:py-16 px-4 sm:px-6 lg:px-8 space-y-16 md:space-y-24 overflow-x-hidden">
      {/* Hero Section */}
      <section className="text-center space-y-6 md:space-y-8 relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-primary/20 blur-[100px] -z-10 rounded-full" />
        
        <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-full px-4 py-1.5 mb-2 animate-in fade-in slide-in-from-top-4 duration-700">
          <Shield className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-primary">Decentralized Philosophy</span>
        </div>
        
        <h1 className="font-display font-black text-4xl sm:text-6xl md:text-8xl uppercase tracking-tighter leading-[0.9] animate-in fade-in zoom-in-95 duration-700">
          Crypto <br className="sm:hidden" /><span className="text-glow-shift">Native</span>
        </h1>
        
        <p className="text-base md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed px-2">
          Built on the blockchain, for the blockchain. DGC Arcade is a pure crypto-first ecosystem designed for privacy, speed, and global access.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Button 
            size="lg" 
            className="w-full sm:w-auto font-black uppercase tracking-widest px-8 py-6 rounded-2xl shadow-[0_0_20px_rgba(255,215,0,0.2)] hover:scale-105 transition-transform"
            onClick={() => setLocation("/games")}
          >
            Start Playing
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
          <Button 
            variant="outline" 
            size="lg" 
            className="w-full sm:w-auto font-black uppercase tracking-widest px-8 py-6 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10"
            onClick={() => {
              const el = document.getElementById('ecosystem');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Explore Assets
          </Button>
        </div>
      </section>

      {/* Philosophy Section */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-8">
        {[
          {
            icon: Lock,
            title: "No Middlemen",
            desc: "By removing traditional banks, we remove the limits, the fees, and the intrusive questions.",
            color: "text-blue-400",
            bg: "bg-blue-400/10",
            border: "border-blue-400/20"
          },
          {
            icon: Globe,
            title: "Global Access",
            desc: "If you have a wallet, you can play. We transcend borders and banking restrictions.",
            color: "text-purple-400",
            bg: "bg-purple-400/10",
            border: "border-purple-400/20"
          },
          {
            icon: Cpu,
            title: "Hard-Coded Trust",
            desc: "Our platform logic is tied directly to cryptographic verification, not human promises.",
            color: "text-emerald-400",
            bg: "bg-emerald-400/10",
            border: "border-emerald-400/20"
          }
        ].map((item, i) => (
          <div key={i} className={`group rounded-[2rem] border ${item.border} bg-secondary/10 p-8 space-y-6 hover:bg-secondary/20 transition-all duration-500 hover:-translate-y-1`}>
            <div className={`w-14 h-14 rounded-2xl ${item.bg} flex items-center justify-center group-hover:scale-110 transition-transform duration-500`}>
              <item.icon className={`w-7 h-7 ${item.color}`} />
            </div>
            <div className="space-y-3">
              <h3 className="font-display font-black text-xl md:text-2xl uppercase tracking-tight">{item.title}</h3>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Assets Section */}
      <section id="ecosystem" className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div className="order-2 lg:order-1 relative group">
          <div className="absolute -inset-4 bg-primary/5 blur-3xl rounded-[3rem] group-hover:bg-primary/10 transition-colors duration-700" />
          <div className="relative rounded-[2.5rem] overflow-hidden border border-white/10 bg-black/40 backdrop-blur-sm p-6 md:p-12 aspect-square sm:aspect-video lg:aspect-square flex items-center justify-center">
            <div className="grid grid-cols-3 gap-4 md:gap-8 relative z-10 w-full">
              {[
                { name: "BTC", color: "text-[#F7931A]", bg: "bg-[#F7931A]/10" },
                { name: "ETH", color: "text-[#627EEA]", bg: "bg-[#627EEA]/10" },
                { name: "LTC", color: "text-[#345D9D]", bg: "bg-[#345D9D]/10" },
                { name: "USDT", color: "text-[#26A17B]", bg: "bg-[#26A17B]/10" },
                { name: "USDC", color: "text-[#2775CA]", bg: "bg-[#2775CA]/10" },
                { name: "DOGE", color: "text-[#C2A633]", bg: "bg-[#C2A633]/10" }
              ].map((coin) => (
                <div key={coin.name} className="flex flex-col items-center gap-3 group/coin">
                  <div className={`w-14 h-14 md:w-20 md:h-20 rounded-3xl ${coin.bg} border border-white/5 flex items-center justify-center font-mono font-black text-sm md:text-lg ${coin.color} shadow-2xl group-hover/coin:scale-110 group-hover/coin:border-white/20 transition-all duration-300`}>
                    {coin.name}
                  </div>
                  <span className="text-[10px] md:text-xs font-black tracking-[0.3em] text-muted-foreground/60 uppercase">{coin.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="order-1 lg:order-2 space-y-8 md:pl-8">
          <div className="space-y-4">
            <h2 className="font-display font-black text-3xl md:text-5xl uppercase tracking-tighter leading-none">
              Asset <span className="text-primary">Ecosystem</span>
            </h2>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
              We support the world's most trusted cryptocurrencies. Our backend automatically handles exchange rates in real-time, ensuring your bets are always accurate and your winnings are always secure.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: Zap, text: "Instant Deposits" },
              { icon: RefreshCcw, text: "Real-time Rates" },
              { icon: Shield, text: "SegWit Optimized" },
              { icon: Wallet, text: "Multi-chain Support" }
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                <item.icon className="w-5 h-5 text-primary" />
                <span className="text-sm font-bold uppercase tracking-wider">{item.text}</span>
              </div>
            ))}
          </div>

          <ul className="space-y-4 pt-2">
            {[
              "Multi-chain deposit support for BTC, ETH, SOL",
              "SegWit and Taproot optimized BTC addresses",
              "ERC-20, TRC-20, and BEP-20 USDT options",
              "Zero-fee internal vault transfers"
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground group">
                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-primary shrink-0 group-hover:scale-150 transition-transform" />
                <span className="leading-tight">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Final Callout */}
      <section className="relative text-center rounded-[3rem] overflow-hidden border border-primary/20 bg-black/40 backdrop-blur-md p-8 md:p-20 group">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/20 blur-[120px] rounded-full -z-10 group-hover:bg-primary/30 transition-colors duration-700" />
        
        <div className="relative z-10 space-y-8">
          <div className="w-20 h-20 md:w-28 md:h-28 rounded-[2rem] bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto shadow-2xl animate-bounce duration-[3000ms]">
            <Coins className="w-10 h-10 md:w-14 md:h-14 text-primary" />
          </div>
          
          <div className="space-y-4">
            <h2 className="font-display font-black text-3xl md:text-6xl uppercase tracking-tighter leading-none">
              The Future is <span className="text-glow-shift">Crypto</span>
            </h2>
            <p className="text-base md:text-xl text-muted-foreground max-w-xl mx-auto">
              Join the Different Grind Crew and experience the freedom of a truly crypto-native platform.
            </p>
          </div>

          <div className="pt-4">
            <Button 
              size="lg" 
              className="w-full sm:w-auto font-black uppercase tracking-widest px-12 py-8 text-xl rounded-2xl btn-pulse shadow-[0_0_40px_rgba(255,215,0,0.3)] hover:scale-105 transition-transform"
              onClick={() => setLocation("/games")}
            >
              Deposit Now
              <ArrowRight className="ml-3 w-6 h-6" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
