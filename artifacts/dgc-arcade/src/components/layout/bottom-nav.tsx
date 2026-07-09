import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useAuthModal } from "@/hooks/use-auth-modal";
import { Home, Gamepad2, Trophy, User, Zap } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { usePlatformSettings } from "@/hooks/use-platform-settings";

export function BottomNav() {
  const [location] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { settings } = usePlatformSettings();
  const authModal = useAuthModal();

  const active = (path: string) =>
    location === path
      ? "text-primary"
      : "text-muted-foreground";

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-primary/20 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80 safe-area-bottom shadow-[0_-8px_30px_rgb(0,0,0,0.5)]">
      <div className="grid grid-cols-5 h-16 items-center">
        {/* Home */}
        <Link href="/" className={`flex flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-tighter transition-all duration-300 ${active("/")}`}>
          <div className={`p-1.5 rounded-xl transition-all ${location === "/" ? "bg-primary/20 shadow-[0_0_15px_rgba(255,215,0,0.2)] scale-110 -translate-y-1" : ""}`}>
            <Home className={`w-5 h-5 ${location === "/" ? "animate-pulse" : ""}`} />
          </div>
          <span>Home</span>
        </Link>

        {/* Games */}
        <Link href="/games" className={`flex flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-tighter transition-all duration-300 ${active("/games")}`}>
          <div className={`p-1.5 rounded-xl transition-all ${location === "/games" ? "bg-primary/20 shadow-[0_0_15px_rgba(255,215,0,0.2)] scale-110 -translate-y-1" : ""}`}>
            <Gamepad2 className={`w-5 h-5 ${location === "/games" ? "animate-pulse" : ""}`} />
          </div>
          <span>Games</span>
        </Link>

        {/* Race - Center Highlighted */}
        <Link href="/race" className={`flex flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-tighter transition-all duration-300 ${active("/race")}`}>
          <div className={`p-2.5 rounded-2xl transition-all relative group ${location === "/race" ? "bg-gradient-to-br from-primary to-amber-500 text-black scale-125 shadow-[0_0_30px_rgba(255,215,0,0.6)] -translate-y-3" : "bg-secondary"}`}>
            <span className={`text-2xl ${location === "/race" ? "animate-bounce" : ""}`}>🏇</span>
            {location !== "/race" && <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-ping" />}
          </div>
          <span className={location === "/race" ? "mt-2 text-primary font-black" : ""}>Race</span>
        </Link>

        {/* Slots */}
        <Link href="/slots" className={`flex flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-tighter transition-all duration-300 ${active("/slots")}`}>
          <div className={`p-1.5 rounded-xl transition-all ${location === "/slots" ? "bg-primary/20 shadow-[0_0_15px_rgba(255,215,0,0.2)] scale-110 -translate-y-1" : ""}`}>
            <Zap className={`w-5 h-5 ${location === "/slots" ? "animate-pulse" : ""}`} />
          </div>
          <span>Slots</span>
        </Link>

        {/* Sportsbook */}
        <Link href="/sportsbook" className={`flex flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-tighter transition-all duration-300 ${active("/sportsbook")}`}>
          <div className={`p-1.5 rounded-xl transition-all ${location === "/sportsbook" ? "bg-primary/20 shadow-[0_0_15px_rgba(255,215,0,0.2)] scale-110 -translate-y-1" : ""}`}>
            <Trophy className={`w-5 h-5 ${location === "/sportsbook" ? "animate-pulse" : ""}`} />
          </div>
          <span>Sports</span>
        </Link>

        {/* Profile / Auth */}
        {isAuthenticated && user ? (
          <Link href="/profile" className={`flex flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-tighter transition-all duration-300 ${active("/profile")}`}>
            <div className={`p-2 rounded-2xl transition-all relative group ${location === "/profile" ? "bg-cyan-500 text-black scale-110 shadow-[0_0_20px_rgba(34,211,238,0.4)] -translate-y-2" : ""}`}>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-black ${location === "/profile" ? "bg-gradient-to-br from-cyan-400 to-blue-500 border-cyan-300 text-white" : "bg-primary/20 border-primary/50 text-primary"}`}>
                {(user.username?.[0] ?? "?").toUpperCase()}
              </div>
            </div>
            <span className={`font-mono font-black ${location === "/profile" ? "text-cyan-500 mt-1" : "text-primary"}`}>
              {formatCurrency(user.balance)}
            </span>
          </Link>
        ) : (
          <button
            onClick={() => authModal.open("login")}
            className="flex flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-tighter text-muted-foreground hover:text-primary transition-colors"
          >
            <div className="p-2 rounded-2xl bg-secondary/50 hover:bg-secondary transition-all">
              <User className="w-5 h-5" />
            </div>
            <span>Sign In</span>
          </button>
        )}
      </div>
    </nav>
  );
}
