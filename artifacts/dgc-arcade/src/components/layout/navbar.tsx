import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useAuthModal } from "@/hooks/use-auth-modal";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { User, Wallet, LogOut, Menu, Shield, Gift } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { WalletModal } from "@/components/wallet/wallet-modal";
import { DailyBonusModal } from "@/components/ui/daily-bonus-modal";
import { useState } from "react";

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const authModal = useAuthModal();
  const [location, setLocation] = useLocation();
  const [walletOpen, setWalletOpen] = useState(false);
  const [bonusOpen, setBonusOpen] = useState(false);
  const isAdmin = user?.role === "admin";

  const NavLinks = () => (
    <>
      <Link href="/games" className={`text-sm font-medium uppercase tracking-wider transition-colors ${location === "/games" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
        Games
      </Link>
      <Link href="/leaderboard" className={`text-sm font-medium uppercase tracking-wider transition-colors ${location === "/leaderboard" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
        Leaderboard
      </Link>
      {isAdmin && (
        <Link href="/admin" className={`text-sm font-medium uppercase tracking-wider transition-colors flex items-center gap-1 ${location === "/admin" ? "text-primary" : "text-amber-500/80 hover:text-amber-400"}`}>
          <Shield className="w-3.5 h-3.5" />Admin
        </Link>
      )}
    </>
  );

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center font-display font-black text-primary-foreground text-xl shadow-[0_0_16px_var(--theme-glow-strong)] group-hover:shadow-[0_0_28px_var(--theme-glow-strong)] transition-shadow duration-300">
                D
              </div>
              <span className="font-display font-bold text-xl uppercase tracking-widest hidden sm:inline-block">
                DGC <span className="text-glow-shift-slow">Arcade</span>
              </span>
            </Link>
            <div className="hidden md:flex items-center gap-6">
              <NavLinks />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeSwitcher />

            {isAuthenticated && user ? (
              <>
                {/* Daily Bonus */}
                <Button
                  variant="ghost" size="icon" className="h-9 w-9 rounded-full text-primary hover:text-primary/80 relative"
                  title="Daily Bonus"
                  onClick={() => setBonusOpen(true)}
                >
                  <Gift className="w-4 h-4" />
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border border-background animate-pulse" />
                </Button>

                {/* Wallet balance button */}
                <button
                  className="hidden sm:flex items-center gap-2 bg-secondary/80 rounded-full px-4 py-1.5 border border-primary/20 backdrop-blur-sm hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => setWalletOpen(true)}
                >
                  <Wallet className="w-4 h-4 text-primary" />
                  <span className="font-mono font-bold text-primary text-sm">{formatCurrency(user.balance)}</span>
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 p-0">
                      <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center border border-primary/40 text-primary font-bold text-sm hover:border-primary transition-colors">
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-card border-border/60 backdrop-blur-xl">
                    <div className="flex items-center justify-start gap-2 p-2">
                      <div className="flex flex-col space-y-1 leading-none">
                        <p className="font-medium text-sm">{user.username}</p>
                        <p className="text-xs text-muted-foreground font-mono text-primary sm:hidden">{formatCurrency(user.balance)}</p>
                        {isAdmin && <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Admin</span>}
                      </div>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer" onClick={() => setLocation("/profile")}>
                      <User className="mr-2 h-4 w-4" /><span>Profile</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => setWalletOpen(true)}>
                      <Wallet className="mr-2 h-4 w-4" /><span>Wallet</span>
                    </DropdownMenuItem>
                    {isAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="cursor-pointer text-amber-400 focus:text-amber-300" onClick={() => setLocation("/admin")}>
                          <Shield className="mr-2 h-4 w-4" /><span>Admin Panel</span>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} className="text-destructive focus:bg-destructive/10 cursor-pointer">
                      <LogOut className="mr-2 h-4 w-4" /><span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" className="hidden sm:inline-flex font-bold uppercase text-sm" onClick={() => authModal.open("login")}>
                  Log in
                </Button>
                <Button className="font-bold uppercase tracking-wider text-sm btn-pulse" onClick={() => authModal.open("register")}>
                  Sign Up Free
                </Button>
              </div>
            )}

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden h-9 w-9">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="bg-card/95 backdrop-blur-xl border-l-border/40">
                <div className="flex flex-col gap-5 mt-8">
                  <NavLinks />
                  {isAuthenticated && user && (
                    <div className="mt-4 p-4 rounded-xl bg-secondary border border-primary/20 flex flex-col gap-1.5">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Balance</span>
                      <span className="font-mono font-bold text-xl text-primary">{formatCurrency(user.balance)}</span>
                      <Button size="sm" className="mt-2 font-bold uppercase" onClick={() => setWalletOpen(true)}>
                        <Wallet className="w-3.5 h-3.5 mr-1.5" />Wallet
                      </Button>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>

      {isAuthenticated && (
        <>
          <WalletModal open={walletOpen} onClose={() => setWalletOpen(false)} />
          <DailyBonusModal open={bonusOpen} onClose={() => setBonusOpen(false)} />
        </>
      )}
    </>
  );
}
