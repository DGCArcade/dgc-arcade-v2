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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-primary/20 bg-black/90 backdrop-blur-2xl supports-[backdrop-filter]:bg-black/60 safe-area-bottom shadow-[0_-10px_40px_rgba(0,0,0,0.8)]">
      <div className="grid grid-cols-5 h-20 items-center px-2">
        {/* Home */}
        <Link href="/" className={`flex flex-col items-center justify-center gap-1.5 transition-all duration-300 ${active("/")}`}>
          <div className={`p-2 rounded-xl transition-all duration-500 ${location === "/" ? "bg-primary/20 shadow-[0_0_20px_rgba(255,215,0,0.3)] scale-110 -translate-y-1.5" : "hover:bg-white/5"}`}>
            <Home className={`w-6 h-6 ${location === "/" ? "animate-pulse" : ""}`} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest">Home</span>
        </Link>

        {/* Games */}
        <Link href="/games" className={`flex flex-col items-center justify-center gap-1.5 transition-all duration-300 ${active("/games")}`}>
          <div className={`p-2 rounded-xl transition-all duration-500 ${location === "/games" ? "bg-primary/20 shadow-[0_0_20px_rgba(255,215,0,0.3)] scale-110 -translate-y-1.5" : "hover:bg-white/5"}`}>
            <Gamepad2 className={`w-6 h-6 ${location === "/games" ? "animate-pulse" : ""}`} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest">Games</span>
        </Link>

        {/* Race - Center Highlighted */}
        <Link href="/race" className="flex flex-col items-center justify-center -translate-y-4">
          <div className={`w-16 h-16 rounded-[2rem] transition-all duration-500 relative group flex items-center justify-center ${location === "/race" ? "bg-gradient-to-br from-primary to-orange-500 text-black scale-110 shadow-[0_0_40px_rgba(255,215,0,0.6)]" : "bg-zinc-900 border border-white/10 text-primary shadow-2xl"}`}>
            <span className={`text-3xl ${location === "/race" ? "animate-bounce" : "group-hover:scale-110 transition-transform"}`}>🏇</span>
            {location !== "/race" && <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full animate-ping shadow-[0_0_10px_rgba(255,215,0,0.8)]" />}
          </div>
          <span className={`text-[10px] font-black uppercase tracking-[0.2em] mt-2 transition-colors ${location === "/race" ? "text-primary" : "text-muted-foreground"}`}>Race</span>
        </Link>

        {/* Sports / Slots Toggle */}
        <Link href="/sportsbook" className={`flex flex-col items-center justify-center gap-1.5 transition-all duration-300 ${active("/sportsbook") || active("/slots")}`}>
          <div className={`p-2 rounded-xl transition-all duration-500 ${location === "/sportsbook" || location === "/slots" ? "bg-primary/20 shadow-[0_0_20px_rgba(255,215,0,0.3)] scale-110 -translate-y-1.5" : "hover:bg-white/5"}`}>
            <Trophy className={`w-6 h-6 ${location === "/sportsbook" || location === "/slots" ? "animate-pulse" : ""}`} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest">Sports</span>
        </Link>

        {/* Profile / Auth */}
        {isAuthenticated && user ? (
          <Link href="/profile" className={`flex flex-col items-center justify-center gap-1.5 transition-all duration-300 ${active("/profile")}`}>
            <div className={`p-2 rounded-xl transition-all duration-500 ${location === "/profile" ? "bg-primary/20 shadow-[0_0_20px_rgba(255,215,0,0.3)] scale-110 -translate-y-1.5" : "hover:bg-white/5"}`}>
              <div className="w-6 h-6 rounded-full border-2 border-primary/50 bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary">
                {(user.username?.[0] ?? "?").toUpperCase()}
              </div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest truncate max-w-[60px]">
              {formatCurrency(user.balance).split('.')[0]}
            </span>
          </Link>
        ) : (
          <button
            onClick={() => authModal.open("login")}
            className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-primary transition-all duration-300"
          >
            <div className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all">
              <User className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest">Sign In</span>
          </button>
        )}
      </div>
    </nav>
  );
}
