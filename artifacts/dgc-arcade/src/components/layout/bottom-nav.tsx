import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useAuthModal } from "@/hooks/use-auth-modal";
import { Home, Gamepad2, Trophy, User, Zap } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { usePlatformSettings } from "@/hooks/use-platform-settings";
import { CoinIcon } from "@/components/wallet/coin-icon";

export function BottomNav() {
  const [location] = useLocation();
  const { user, isAuthenticated, cryptoBalances } = useAuth();
  const { settings } = usePlatformSettings();
  const authModal = useAuthModal();

  const active = (path: string) =>
    location === path
      ? "text-primary"
      : "text-muted-foreground";

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-white/5 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80 safe-area-bottom shadow-[0_-8px_30px_rgb(0,0,0,0.5)]">
      <div className="flex h-16 items-center justify-around px-2">
        {/* Home */}
        <Link href="/" className={`flex flex-col items-center justify-center gap-1 transition-all duration-300 ${active("/")}`}>
          <Home className={`w-5 h-5 ${location === "/" ? "animate-pulse" : ""}`} />
          <span className="text-[9px] font-black uppercase tracking-widest">Home</span>
        </Link>

        {/* Slots */}
        <Link href="/slots" className={`flex flex-col items-center justify-center gap-1 transition-all duration-300 ${active("/slots")}`}>
          <Zap className={`w-5 h-5 ${location === "/slots" ? "animate-pulse" : ""}`} />
          <span className="text-[9px] font-black uppercase tracking-widest">Slots</span>
        </Link>

        {/* Games - Glowing Highlight */}
        <Link href="/games" className={`flex flex-col items-center justify-center gap-1 transition-all duration-300 ${active("/games")}`}>
          <div className={`p-1.5 rounded-xl transition-all ${location === "/games" ? "bg-primary/20 shadow-[0_0_20px_rgba(255,215,0,0.4)] scale-110 -translate-y-1" : ""}`}>
            <Gamepad2 className={`w-5 h-5 ${location === "/games" ? "animate-pulse" : ""}`} />
          </div>
          <span className={`text-[9px] font-black uppercase tracking-widest ${location === "/games" ? "text-glow-shift" : ""}`}>Games</span>
        </Link>

        {/* Chicken Run */}
        <Link href="/chicken-road" className={`flex flex-col items-center justify-center gap-1 transition-all duration-300 ${active("/chicken-road")}`}>
          <span className={`text-xl ${location === "/chicken-road" ? "animate-bounce" : ""}`}>🐔</span>
          <span className="text-[9px] font-black uppercase tracking-widest">Chicken</span>
        </Link>

        {/* Horse Race */}
        <Link href="/race" className={`flex flex-col items-center justify-center gap-1 transition-all duration-300 ${active("/race")}`}>
          <span className={`text-xl ${location === "/race" ? "animate-bounce" : ""}`}>🏇</span>
          <span className="text-[9px] font-black uppercase tracking-widest">Race</span>
        </Link>

        {/* Sports */}
        <Link href="/sportsbook" className={`flex flex-col items-center justify-center gap-1 transition-all duration-300 ${active("/sportsbook")}`}>
          <Trophy className={`w-5 h-5 ${location === "/sportsbook" ? "animate-pulse" : ""}`} />
          <span className="text-[9px] font-black uppercase tracking-widest">Sports</span>
        </Link>

        {/* Profile / Auth */}
        {isAuthenticated && user ? (
          <Link href="/profile" className={`flex flex-col items-center justify-center gap-1 transition-all duration-300 ${active("/profile")}`}>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-black ${location === "/profile" ? "bg-primary border-primary text-black" : "bg-primary/20 border-primary/50 text-primary"}`}>
              {(user.username?.[0] ?? "?").toUpperCase()}
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest">Profile</span>
          </Link>
        ) : (
          <button
            onClick={() => authModal.open("login")}
            className="flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors"
          >
            <User className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-widest">Sign In</span>
          </button>
        )}
      </div>
    </nav>
  );
}
