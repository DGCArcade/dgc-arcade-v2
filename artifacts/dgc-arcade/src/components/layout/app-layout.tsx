import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";
import { AlertTriangle } from "lucide-react";
import { Navbar } from "./navbar";
import { BottomNav } from "./bottom-nav";
import { AuthModal } from "@/components/auth/auth-modal";
import { VerificationModal } from "@/components/ui/verification-modal";
import GalaxyBackground from "@/components/GalaxyBackground";
import { LocationGate } from "@/components/ui/location-gate";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const { user, isAuthenticated } = useAuth();
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const showEmailNotice = isAuthenticated && (user as any)?.email && !(user as any)?.emailVerified && !verificationModalOpen;
  const isGamePlayPage = /^\/games\/\d+/.test(location) || /^\/slots\/[^/]+/.test(location) || location === "/race";
  const mobileGameMode = isMobile && isGamePlayPage;
  const mobileCompactFooter = mobileGameMode;

  // Listen for verification modal open events (optional or required)
  useEffect(() => {
    const handleOpenVerificationModal = (e: Event) => {
      const required = (e as CustomEvent).detail?.required === true;
      setVerificationRequired(required);
      setVerificationModalOpen(true);
    };
    window.addEventListener("openVerificationModal", handleOpenVerificationModal);
    return () => window.removeEventListener("openVerificationModal", handleOpenVerificationModal);
  }, []);

  return (
    <LocationGate>
      <div className="min-h-[100dvh] flex flex-col bg-transparent text-foreground selection:bg-primary/30 relative">
        <GalaxyBackground />
        <div className="relative z-10 flex flex-col min-h-[100dvh]">
          {showEmailNotice && (
            <div className="bg-amber-500/10 border-b border-amber-500/20 py-2 px-4 flex items-center justify-center gap-2 text-[10px] md:text-xs text-amber-300 font-bold uppercase tracking-wider animate-in fade-in slide-in-from-top-4">
              <AlertTriangle className="w-3 h-3 md:w-4 md:h-4 text-amber-400" />
              Your email is unverified. 
              <button 
                onClick={() => setVerificationModalOpen(true)}
                className="underline hover:text-amber-200 transition-colors ml-1"
              >
                Verify Now
              </button>
            </div>
          )}
          <Navbar />
          <main className={`flex-1 w-full mx-auto flex flex-col overflow-x-hidden min-h-0 ${
            mobileGameMode
              ? "max-w-full px-0 py-0 pb-0 overflow-hidden [&>*]:flex-1 [&>*]:min-h-0"
              : "max-w-7xl px-2 sm:px-4 md:px-6 lg:px-8 py-3 md:py-8 pb-20 md:pb-8"
          }`}>
            {children}
          </main>

          <footer className={`border-t border-border/30 mt-auto bg-black/60 backdrop-blur-md ${mobileCompactFooter ? "hidden md:block" : ""}`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
                <div className="col-span-2 md:col-span-1">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center font-display font-black text-black text-lg relative overflow-hidden shadow-[0_0_15px_rgba(255,215,0,0.2)]"
                         style={{ background: "linear-gradient(135deg, #FFD700 0%, #B8860B 100%)" }}>
                      <span className="relative z-10">D</span>
                    </div>
                    <div className="flex flex-col leading-[0.85]">
                      <span className="font-display font-black text-xl tracking-tighter text-glow-shift">DGC</span>
                      <span className="font-display font-black text-[9px] text-muted-foreground tracking-[0.3em] ml-0.5">ARCADE</span>
                    </div>
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
                    <li><a href="mailto:support@dgcarcade.com" className="hover:text-foreground transition-colors">support@dgcarcade.com</a></li>
                    <li><a href="https://t.me/dgcarcade" target="_blank" rel="noopener" className="hover:text-foreground transition-colors">Telegram</a></li>
                  </ul>
                </div>
              </div>

              <div className="border-t border-border/30 pt-6 space-y-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground/70">
                  <span>🎰 Operated by <strong className="text-muted-foreground">DGC Arcade Ltd.</strong></span>
                  <span>·</span>
                  <span>Licensed gaming platform</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground/50">
                  <span>© {new Date().getFullYear()} DGC Arcade — DGCArcade.com</span>
                  <span>·</span>
                  <Link href="/provably-fair" className="hover:text-foreground transition-colors font-medium underline underline-offset-2">All games use provably fair algorithms</Link>
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

          {/* Compact mobile footer on game pages */}
          {mobileCompactFooter && (
            <footer className="border-t border-border/30 bg-black/80 backdrop-blur-md md:hidden shrink-0">
              <div className="px-3 py-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[9px] text-muted-foreground">
                <Link href="/games" className="hover:text-foreground">Games</Link>
                <span>·</span>
                <Link href="/terms" className="hover:text-foreground">Terms</Link>
                <span>·</span>
                <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
                <span>·</span>
                <Link href="/provably-fair" className="hover:text-foreground">Provably Fair</Link>
                <span>·</span>
                <span>© {new Date().getFullYear()} DGC Arcade</span>
              </div>
            </footer>
          )}
          <AuthModal />
          <VerificationModal
            open={verificationModalOpen}
            required={verificationRequired}
            onClose={() => { setVerificationModalOpen(false); setVerificationRequired(false); }}
          />
          {!mobileGameMode && <BottomNav />}
          {mobileGameMode && (
            <div className="md:hidden shrink-0 h-14" aria-hidden="true" />
          )}
        </div>
      </div>
    </LocationGate>
  );
}
