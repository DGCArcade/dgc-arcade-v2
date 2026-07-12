import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useAuthModal } from "@/hooks/use-auth-modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import {User, Wallet, LogOut, Menu, Shield, Gift, Settings, Building2, KeyRound, Star, X, ArrowLeftRight, MessageSquare, TrendingUp, TrendingDown, Trophy, Gamepad2, Zap} from "lucide-react";
import { CoinIcon } from "@/components/wallet/coin-icon";
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
import { VipModal, getVipProgress } from "@/components/vip/vip-modal";
import { useState, useEffect } from "react";
import { rotateTheme } from "@/lib/theme";
import { usePlatformSettings } from "@/hooks/use-platform-settings";

export function Navbar() {
  const { user, isAuthenticated, logout, cryptoBalances } = useAuth();
  const { settings } = usePlatformSettings();
  const authModal = useAuthModal();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    rotateTheme();
  }, [location]);
  const [walletOpen, setWalletOpen] = useState(false);
  const [bonusOpen, setBonusOpen] = useState(false);
  const [vipOpen, setVipOpen] = useState(false);
  const isOwner = user ? ((user.username ?? "").toLowerCase() === (process.env.REACT_APP_OWNER_USERNAME || "owner") || (user as any).role === "owner") : false;
  const isAdmin = user ? (user.role === "admin" || user.role === "owner" || isOwner) : false;
  const isCreator = user?.accountType === "creator" || user?.role === "creator";
  const [bankPinOpen, setBankPinOpen] = useState(false);
  const [bankPin, setBankPin] = useState("");
  const [bankPinError, setBankPinError] = useState("");
  const [bankPinLoading, setBankPinLoading] = useState(false);
  const [creatorUnread, setCreatorUnread] = useState(0);

  const altToken = typeof localStorage !== "undefined" ? localStorage.getItem("dgc_alt_token") : null;
  const altProfileType = typeof localStorage !== "undefined" ? localStorage.getItem("dgc_alt_profile_type") : null;
  const hasAltProfile = !!altToken;

  function switchProfile() {
    if (!altToken) return;
    const currentToken = localStorage.getItem("dgc_token") ?? "";
    const currentType = altProfileType === "personal" ? "creator" : "personal";
    localStorage.setItem("dgc_alt_token", currentToken);
    localStorage.setItem("dgc_alt_profile_type", currentType);
    localStorage.setItem("dgc_token", altToken);
    window.location.href = altProfileType === "personal" ? "/profile" : "/creator";
  }

  const wagered = (user as any)?.totalWageredAmount ?? 0;
  const { tier: vipTier, next: vipNext, pct: vipPct } = getVipProgress(wagered);

  // Track previous balance to show up/down trend arrow
  const [prevBalance, setPrevBalance] = useState<number | null>(null);
  const [balanceDelta, setBalanceDelta] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (!user) return;
    const cur = user.balance as number;
    if (prevBalance !== null && Math.abs(cur - prevBalance) > 0.0001) {
      setBalanceDelta(cur > prevBalance ? "up" : "down");
      const t = setTimeout(() => setBalanceDelta(null), 3000);
      setPrevBalance(cur);
      return () => clearTimeout(t);
    } else {
      setPrevBalance(cur);
      return undefined;
    }
  }, [user?.balance]); // eslint-disable-line react-hooks/exhaustive-deps

  // Top crypto holding for the sub-line in navbar
  const topCrypto = cryptoBalances.length > 0
    ? cryptoBalances.reduce((a, b) => a.usdValue > b.usdValue ? a : b)
    : null;

  useEffect(() => {
    if (!isCreator || !isAuthenticated) return;
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("dgc_token") : null;
    const poll = () => fetch("/api/creator/messages/unread-count", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (typeof d.unread === "number") setCreatorUnread(d.unread); }).catch(() => {});
    poll();
    const id = setInterval(poll, 20000);
    return () => clearInterval(id);
  }, [isCreator, isAuthenticated]);

  const NavLinks = () => (
    <div className="flex items-center gap-8">
      {settings.gamesEnabled && (
        <Link href="/games" className={`group flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] transition-all duration-300 ${location === "/games" ? "text-primary scale-110" : "text-muted-foreground hover:text-foreground hover:scale-105"}`}>
          <Gamepad2 className={`w-4 h-4 ${location === "/games" ? "animate-pulse" : "group-hover:animate-bounce"}`} />
          <span>Games</span>
        </Link>
      )}

      {settings.raceEnabled && (
        <Link href="/race" className={`group flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] transition-all duration-300 ${location === "/race" ? "text-primary scale-110" : "text-muted-foreground hover:text-foreground hover:scale-105"}`}>
          <Zap className={`w-4 h-4 ${location === "/race" ? "animate-pulse" : "group-hover:animate-bounce"}`} />
          <span>Race</span>
        </Link>
      )}

      {settings.leaderboardEnabled && (
        <Link href="/leaderboard" className={`group flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] transition-all duration-300 ${location === "/leaderboard" ? "text-primary scale-110" : "text-muted-foreground hover:text-foreground hover:scale-105"}`}>
          <TrendingUp className={`w-4 h-4 ${location === "/leaderboard" ? "animate-pulse" : "group-hover:animate-bounce"}`} />
          <span>Chicken</span>
        </Link>
      )}

      {settings.slotsEnabled && (
        <Link href="/slots" className={`group flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] transition-all duration-300 ${location === "/slots" ? "text-primary scale-110" : "text-muted-foreground hover:text-foreground hover:scale-105"}`}>
          <Zap className={`w-4 h-4 ${location === "/slots" ? "animate-pulse" : "group-hover:animate-bounce"}`} />
          <span>Slots</span>
        </Link>
      )}

      {settings.sportsbookEnabled && (
        <Link href="/sportsbook" className={`group relative px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.25em] transition-all duration-500 flex items-center gap-3 overflow-hidden ${
          location === "/sportsbook"
            ? "text-black bg-primary shadow-[0_0_30px_rgba(255,215,0,0.5)] scale-110"
            : "text-primary border border-primary/20 hover:border-primary/60 hover:bg-primary/5 hover:scale-105"
        }`}>
          <span className="text-lg">👑</span>
          <span>Sportsbook</span>
          {location !== "/sportsbook" && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
          )}
        </Link>
      )}
      
      {isAdmin && (
        <Link href="/admin" className={`group flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] transition-all duration-300 ${location === "/admin" ? "text-amber-400 scale-110" : "text-amber-500/60 hover:text-amber-400 hover:scale-105"}`}>
          <Shield className={`w-4 h-4 ${location === "/admin" ? "animate-pulse" : "group-hover:animate-bounce"}`} />
          <span>Admin</span>
        </Link>
      )}
    </div>
  );

  async function handleBankPinSubmit() {
    if (bankPin.length < 5) return;
    setBankPinLoading(true);
    setBankPinError("");
    try {
      const token = typeof localStorage !== "undefined" ? localStorage.getItem("dgc_token") : null;
      const res = await fetch("/api/admin/verify-bank-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        credentials: "include",
        body: JSON.stringify({ pin: bankPin }),
      });
      const data = await res.json();
      if (!res.ok) { setBankPinError(data.error ?? "Incorrect PIN"); setBankPin(""); }
      else { sessionStorage.setItem("dgcBankSession", data.sessionToken); sessionStorage.setItem("dgcBankExpires", data.expiresAt); setBankPinOpen(false); setBankPin(""); setLocation("/admin?tab=bank"); }
    } catch { setBankPinError("Connection error. Try again."); }
    finally { setBankPinLoading(false); }
  }

  function handleCreatorHubClick() {
    setLocation("/creator");
  }

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="d-sports-logo w-10 h-10 rounded-xl flex items-center justify-center font-display font-black text-primary-foreground text-lg group-hover:scale-110 transition-transform duration-300 relative">
                <span className="relative z-10">D</span>
              </div>
              <div className="hidden sm:flex flex-col leading-tight">
                <span className="font-display font-black text-sm uppercase tracking-[0.3em] text-primary">D Sports</span>
                <span className="font-mono text-[10px] text-muted-foreground tracking-widest">ARCADE</span>
              </div>
            </Link>
            <div className="hidden md:flex items-center gap-6"><NavLinks /></div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            {isAuthenticated && user ? (
              <>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-primary hover:text-primary/80 relative" title="Daily Bonus" onClick={() => setBonusOpen(true)}>
                  <Gift className="w-4 h-4" />
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border border-background animate-pulse" />
                </Button>

                {/* VIP Progress Widget */}
                <button onClick={() => setVipOpen(true)}
                  className="hidden md:flex items-center gap-2 rounded-full px-3 py-1.5 border transition-all cursor-pointer hover:scale-[1.02]"
                  style={{ borderColor: vipTier.color + "50", background: vipTier.color + "10" }}
                  title={`VIP: ${vipTier.name}`}>
                  <span className="text-sm leading-none">{vipTier.icon}</span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-black uppercase tracking-widest leading-none" style={{ color: vipTier.color }}>{vipTier.shortName}</span>
                    <div className="w-16 h-1 rounded-full bg-black/30 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${vipPct}%`, backgroundColor: vipNext ? vipNext.color : vipTier.color }} />
                    </div>
                  </div>
                </button>

                <button className="hidden sm:flex items-center gap-2 bg-secondary/80 rounded-full px-4 py-1.5 border border-primary/20 backdrop-blur-sm hover:border-primary/50 transition-colors cursor-pointer" onClick={() => setWalletOpen(true)}>
                  <Wallet className="w-4 h-4 text-primary" />
                  <div className="flex flex-col items-start leading-none gap-0.5">
                    <div className="flex items-center gap-1">
                      <span className={`font-mono font-bold text-sm transition-colors ${balanceDelta === "up" ? "text-emerald-400" : balanceDelta === "down" ? "text-red-400" : "text-primary"}`}>
                        {formatCurrency(user.balance as number)}
                      </span>
                      {balanceDelta === "up" && <TrendingUp className="w-3 h-3 text-emerald-400" />}
                      {balanceDelta === "down" && <TrendingDown className="w-3 h-3 text-red-400" />}
                    </div>
                    {topCrypto && (
                      <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground font-mono">
                        <CoinIcon currency={topCrypto.currency} size={9} />
                        <span>{topCrypto.amount.toFixed(4)} {topCrypto.currency.split("_")[0]}</span>
                      </div>
                    )}
                  </div>
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 p-0 relative">
                      <div className={`w-9 h-9 rounded-full bg-secondary flex items-center justify-center font-bold text-sm transition-colors ${isCreator ? "border-2 border-purple-500/70 text-purple-300 hover:border-purple-400" : "border border-primary/40 text-primary hover:border-primary"}`}>
                        {(user?.username?.[0] || "?").toUpperCase()}
                      </div>
                      {isCreator && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-purple-600 border border-background flex items-center justify-center shadow-md" title="Creator">
                          <Star className="w-2.5 h-2.5 text-white fill-white" />
                        </span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-card border-border/60 backdrop-blur-xl">
                    <div className="flex items-center justify-start gap-2 p-2">
                      <div className="flex flex-col space-y-1 leading-none">
                        <p className="font-medium text-sm">{user.username}</p>
                        <p className="text-xs text-muted-foreground font-mono text-primary sm:hidden">{formatCurrency(user.balance)}</p>
                        {isAdmin && <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Admin</span>}
                        {isCreator && !isAdmin && <span className="text-xs font-bold uppercase tracking-wider text-purple-400">Creator</span>}
                        <button onClick={() => setVipOpen(true)} className="flex items-center gap-1 mt-0.5 w-fit">
                          <span className="text-xs">{vipTier.icon}</span>
                          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: vipTier.color }}>{vipTier.name}</span>
                        </button>
                      </div>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer" onClick={() => setLocation("/profile")}><User className="mr-2 h-4 w-4" /><span>Profile</span></DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => setWalletOpen(true)}><Wallet className="mr-2 h-4 w-4" /><span>Wallet</span></DropdownMenuItem>
	                    <DropdownMenuItem className="cursor-pointer group/creator" onClick={handleCreatorHubClick}>
	                      <div className="flex items-center w-full">
	                        <div className="relative mr-2">
	                          <Star className="h-4 w-4 text-purple-400 fill-purple-400" />
	                          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary animate-ping" />
	                        </div>
	                        <span className="font-bold text-purple-400">Creator Hub</span>
	                        <Badge variant="outline" className="ml-2 bg-purple-500/10 text-purple-400 border-purple-500/30 text-[9px] px-1 h-4 uppercase tracking-tighter">Creator</Badge>
	                        {isCreator && creatorUnread > 0 && (
	                          <span className="ml-auto min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-black flex items-center justify-center px-1 animate-pulse">
	                            {creatorUnread > 9 ? "9+" : creatorUnread}
	                          </span>
	                        )}
	                      </div>
	                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => setLocation("/settings")}><Settings className="mr-2 h-4 w-4" /><span>Settings</span></DropdownMenuItem>
                    {isAdmin && (<><DropdownMenuSeparator /><DropdownMenuItem className="cursor-pointer text-amber-400 focus:text-amber-300" onClick={() => setLocation("/admin")}><Shield className="mr-2 h-4 w-4" /><span>Admin Panel</span></DropdownMenuItem></>)}
                    {hasAltProfile && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="cursor-pointer text-purple-400 focus:text-purple-300 focus:bg-purple-500/10" onClick={switchProfile}>
                          <ArrowLeftRight className="mr-2 h-4 w-4" />
                          <span>Switch to {altProfileType === "personal" ? "Personal Account" : "Creator Account"}</span>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} className="text-destructive focus:bg-destructive/10 cursor-pointer"><LogOut className="mr-2 h-4 w-4" /><span>Log out</span></DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" className="hidden sm:inline-flex font-bold uppercase text-sm" onClick={() => authModal.open("login")}>Log in</Button>
                <Button className="font-bold uppercase tracking-wider text-sm btn-pulse" onClick={() => authModal.open("register")}>Sign Up Free</Button>
              </div>
            )}

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden h-9 w-9"><Menu className="h-5 w-5" /></Button>
              </SheetTrigger>
              <SheetContent side="right" className="bg-card/95 backdrop-blur-xl border-l-border/40">
                <div className="flex flex-col gap-5 mt-8">
                  <NavLinks />
                  {isAuthenticated && user && (
                    <div className="mt-4 p-4 rounded-xl bg-secondary border border-primary/20 flex flex-col gap-1.5">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Balance</span>
                      <span className="font-mono font-bold text-xl text-primary">{formatCurrency(user.balance)}</span>
                      <Button size="sm" className="mt-2 font-bold uppercase" onClick={() => setWalletOpen(true)}><Wallet className="w-3.5 h-3.5 mr-1.5" />Wallet</Button>
                      <button onClick={() => setVipOpen(true)}
                        className="mt-1 flex items-center gap-2 py-2 px-3 rounded-lg border transition-all"
                        style={{ borderColor: vipTier.color + "50", background: vipTier.color + "10" }}>
                        <span>{vipTier.icon}</span>
                        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: vipTier.color }}>{vipTier.name}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-black/30 overflow-hidden ml-1">
                          <div className="h-full rounded-full" style={{ width: `${vipPct}%`, backgroundColor: vipTier.color }} />
                        </div>
                      </button>
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
          <VipModal open={vipOpen} onClose={() => setVipOpen(false)} />
        </>
      )}

      {bankPinOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-card border border-border/60 rounded-2xl p-8 w-full max-w-sm shadow-2xl mx-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center"><Building2 className="w-5 h-5 text-emerald-400" /></div>
              <div><h2 className="font-display font-black uppercase tracking-widest text-lg">DGC Bank</h2><p className="text-xs text-muted-foreground">Enter your secure PIN to access</p></div>
            </div>
            <div className="space-y-4">
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="password" inputMode="numeric" placeholder="Enter PIN (5–15 digits)" value={bankPin}
                  onChange={e => { setBankPin(e.target.value.replace(/\D/g, "").slice(0, 15)); setBankPinError(""); }}
                  onKeyDown={e => { if (e.key === "Enter") handleBankPinSubmit(); }}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-secondary border border-border/50 font-mono text-lg tracking-[0.3em] text-center focus:outline-none focus:border-emerald-500/50"
                  autoFocus maxLength={15} />
              </div>
              {bankPinError && <p className="text-xs text-red-400 text-center font-medium">{bankPinError}</p>}
              <div className="flex gap-3 mt-2">
                <button onClick={() => setBankPinOpen(false)} className="flex-1 py-2.5 rounded-xl border border-border/50 text-sm font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                <button onClick={handleBankPinSubmit} disabled={bankPinLoading || bankPin.length < 5} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-bold uppercase tracking-wider text-white transition-colors">
                  {bankPinLoading ? "Verifying..." : "Enter"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
