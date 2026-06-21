import { ReactNode } from "react";
import { Link } from "wouter";
import { Navbar } from "./navbar";
import { BottomNav } from "./bottom-nav";
import { AuthModal } from "@/components/auth/auth-modal";
import GalaxyBackground from "@/components/GalaxyBackground";
import { LocationGate } from "@/components/ui/location-gate";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <LocationGate>
      <div className="min-h-[100dvh] flex flex-col bg-transparent text-foreground selection:bg-primary/30 relative">
        <GalaxyBackground />
        <div className="relative z-10 flex flex-col min-h-[100dvh]">
          <Navbar />
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8 flex flex-col">
            {children}
          </main>

          <footer className="border-t border-border/30 mt-auto bg-black/60 backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
                <div className="col-span-2 md:col-span-1">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center font-display font-black text-primary-foreground text-lg">D</div>
                    <span className="font-display font-bold text-lg uppercase tracking-widest">DGC Arcade</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    High-stakes crypto gaming. Provably fair. Instant payouts.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs bg-green-500/10 border border-green-500/30 text-green-400 px-2 py-0.5 rounded-full font-medium">18+</span>
                    <span className="text-xs bg-primary/10 border border-primary/30 text-primary px-2 py-0.5 rounded-full font-medium">Licensed</span>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Games</p>
                  <ul className="space-y-2 text-xs text-muted-foreground">
                    <li><Link href="/games" className="hover:text-foreground transition-colors">All Games</Link></li>
                    <li><Link href="/race" className="hover:text-foreground transition-colors">Horse Race 🏇</Link></li>
                    <li><Link href="/leaderboard" className="hover:text-foreground transition-colors">Leaderboard</Link></li>
                  </ul>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Legal</p>
                  <ul className="space-y-2 text-xs text-muted-foreground">
                    <li><Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
                    <li><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
                    <li><Link href="/responsible-gambling" className="hover:text-foreground transition-colors">Responsible Gambling</Link></li>
                    <li><Link href="/aml" className="hover:text-foreground transition-colors">AML / KYC Policy</Link></li>
                  </ul>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Support</p>
                  <ul className="space-y-2 text-xs text-muted-foreground">
                    <li><a href="mailto:support@dgcarcade.io" className="hover:text-foreground transition-colors">support@dgcarcade.io</a></li>
                    <li><a href="mailto:kyc@dgcarcade.io" className="hover:text-foreground transition-colors">kyc@dgcarcade.io</a></li>
                    <li><a href="https://t.me/dgcarcade" target="_blank" rel="noopener" className="hover:text-foreground transition-colors">Telegram</a></li>
                  </ul>
                </div>
              </div>

              <div className="border-t border-border/30 pt-6 space-y-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground/70">
                  <span>🎰 Operated by <strong className="text-muted-foreground">DGC Arcade Limited</strong></span>
                  <span>·</span>
                  <span>Licensed gaming platform</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground/50">
                  <span>© {new Date().getFullYear()} DGC Arcade — DGCArcade.io</span>
                  <span>·</span>
                  <span>All games use provably fair algorithms</span>
                  <span>·</span>
                  <span className="text-yellow-500/70 font-medium">⚠ Gambling can be addictive. Play responsibly. 18+ only.</span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <a href="https://www.begambleaware.org" target="_blank" rel="noopener"
                    className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors underline">BeGambleAware</a>
                  <a href="https://www.gamcare.org.uk" target="_blank" rel="noopener"
                    className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors underline">GamCare</a>
                  <a href="https://www.gamblersanonymous.org" target="_blank" rel="noopener"
                    className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors underline">Gamblers Anonymous</a>
                </div>
              </div>
            </div>
          </footer>
          <AuthModal />
          <BottomNav />
        </div>
      </div>
    </LocationGate>
  );
}
