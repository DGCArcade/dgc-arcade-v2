import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useAuthModal } from "@/hooks/use-auth-modal";
import { Home, Gamepad2, Trophy, User } from "lucide-react";
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
      <div className="grid grid-cols-3 h-16 items-center">
        {/* Home */}
        <Link href="/" className={`flex flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-tighter transition-all duration-300 ${active("/")}`}>
          <div className={`p-1.5 rounded-xl transition-all ${location === "/" ? "bg-primary/20 shadow-[0_0_15px_rgba(255,215,0,0.2)]" : ""}`}>
            <Home className={`w-5 h-5 ${location === "/" ? "animate-pulse" : ""}`} />
          </div>
          <span>Home</span>
        </Link>

        {/* Games */}
        <Link href="/games" className={`flex flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-tighter transition-all duration-300 ${active("/games")}`}>
          <div className={`p-2 rounded-2xl transition-all relative group ${location === "/games" ? "bg-primary text-black scale-110 shadow-[0_0_20px_rgba(255,215,0,0.4)] -translate-y-2" : "bg-secondary"}`}>
            <Gamepad2 className={`w-6 h-6 ${location === "/games" ? "animate-bounce" : ""}`} />
            {location !== "/games" && <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-ping" />}
          </div>
          <span className={location === "/games" ? "mt-1" : ""}>Games</span>
        </Link>

        {/* Profile / Auth */}
        {isAuthenticated && user ? (
          <Link href="/profile" className={`flex flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-tighter transition-all duration-300 ${active("/profile")}`}>
            <div className={`p-1.5 rounded-xl transition-all ${location === "/profile" ? "bg-primary/20 shadow-[0_0_15px_rgba(255,215,0,0.2)]" : ""}`}>
              <div className="w-5 h-5 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center text-[10px] font-black text-primary">
                {(user.username?.[0] ?? "?").toUpperCase()}
              </div>
            </div>
            <span className="font-mono font-black text-primary">
              {formatCurrency(user.balance)}
            </span>
          </Link>
        ) : (
          <button
            onClick={() => authModal.open("login")}
            className="flex flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-tighter text-muted-foreground"
          >
            <div className="p-1.5 rounded-xl bg-secondary/50">
              <User className="w-5 h-5" />
            </div>
            <span>Sign In</span>
          </button>
        )}
      </div>
    </nav>
  );
}
