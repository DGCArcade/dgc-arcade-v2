import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useAuthModal } from "@/hooks/use-auth-modal";
import { Home, Gamepad2, Trophy, User } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export function BottomNav() {
  const [location] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const authModal = useAuthModal();

  const active = (path: string) =>
    location === path
      ? "text-primary"
      : "text-muted-foreground";

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/90 backdrop-blur-lg supports-[backdrop-filter]:bg-background/80 safe-area-bottom">
      <div className="grid grid-cols-5 h-16">
        {/* Home */}
        <Link href="/" className={`flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${active("/")}`}>
          <Home className="w-5 h-5" />
          <span>Home</span>
        </Link>

        {/* Games */}
        <Link href="/games" className={`flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${active("/games")}`}>
          <Gamepad2 className="w-5 h-5" />
          <span>Games</span>
        </Link>

        {/* Slots — centre, hero button */}
        <Link href="/slots" className="flex flex-col items-center justify-center">
          <div
            className={`flex flex-col items-center justify-center w-14 h-14 rounded-full border-2 -mt-5 shadow-lg transition-all duration-200 ${
              location === "/slots"
                ? "bg-primary border-primary text-primary-foreground shadow-[0_0_20px_var(--theme-glow-strong)]"
                : "bg-secondary border-primary/40 text-primary"
            }`}
          >
            <span className="text-xl leading-none">🎰</span>
            <span className="text-[9px] font-bold uppercase tracking-wide mt-0.5">Slots</span>
          </div>
        </Link>

        {/* Race */}
        <Link href="/race" className={`flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${active("/race")}`}>
          <Trophy className="w-5 h-5" />
          <span>Race</span>
        </Link>

        {/* Profile / Auth */}
        {isAuthenticated && user ? (
          <Link href="/profile" className={`flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${active("/profile")}`}>
            <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center text-xs font-bold text-primary">
              {(user.username?.[0] ?? "?").toUpperCase()}
            </div>
            <span className="font-mono text-[10px] font-bold text-primary leading-none mt-0.5">
              {formatCurrency(user.balance)}
            </span>
          </Link>
        ) : (
          <button
            onClick={() => authModal.open("login")}
            className="flex flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted-foreground"
          >
            <User className="w-5 h-5" />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </nav>
  );
}
