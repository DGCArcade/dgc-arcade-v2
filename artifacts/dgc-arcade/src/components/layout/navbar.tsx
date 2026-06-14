import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useAuthModal } from "@/hooks/use-auth-modal";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import {User, Wallet, LogOut, Menu, Shield, Gift, Settings, Building2, KeyRound, Star, X, ArrowLeftRight, MessageSquare} from "lucide-react";
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

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const authModal = useAuthModal();
  const [location, setLocation] = useLocation();
  const [walletOpen, setWalletOpen] = useState(false);
  const [bonusOpen, setBonusOpen] = useState(false);
  const [vipOpen, setVipOpen] = useState(false);
  const isAdmin = user?.role === "admin" || user?.role === "owner";
  const isOwner = (user?.username ?? "").toLowerCase() === "fanodgc";
  const isCreator = user?.accountType === "creator";
  const [bankPinOpen, setBankPinOpen] = useState(false);
  const [bankPin, setBankPin] = useState("");
  const [bankPinError, setBankPinError] = useState("");
  const [bankPinLoading, setBankPinLoading] = useState(false);
  const [creatorApplyOpen, setCreatorApplyOpen] = useState(false);
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
    <>
      <Link href="/games" className={`text-sm font-medium uppercase tracking-wider transition-colors ${location === "/games" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
        Games
      </Link>
      <Link href="/race" className={`text-sm font-medium uppercase tracking-wider transition-colors flex items-center gap-1 ${location === "/race" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
        🏇 Race
      </Link>
      <Link href="/leaderboard" className={`text-sm font-medium uppercase tracking-wider transition-colors ${location === "/leaderboard" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
        Leaderboard
      </Link>
      {isAdmin && (
        <Link href="/admin" className={`text-sm font-medium uppercase tracking-wider transition-colors flex items-center gap-1 ${location === "/admin" ? "text-primary" : "text-amber-500/80 hover:text-amber-400"}`}>
          <Shield className="w-3.5 h-3.5" />Admin
        </Link>
      )}
      {isAdmin && !isOwner && (
        <button
          onClick={() => { setBankPinOpen(true); setBankPin(""); setBankPinError(""); }}
          className="text-sm font-medium uppercase tracking-wider transition-colors flex items-center gap-1 text-emerald-500/80 hover:text-emerald-400"
        >
          <Building2 className="w-3.5 h-3.5" />DGC Bank
        </button>
      )}
    </>
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
    if (isCreator) setLocation("/creator");
    else setCreatorApplyOpen(true);
  }

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="logo-glow-shift w-9 h-9 rounded-lg flex items-center justify-center font-display font-black text-primary-foreground text-xl group-hover:shadow-[0_0_28px_var(--theme-glow-strong)] transition-shadow duration-300">D</div>
              <span className="font-display font-bold text-xl uppercase tracking-widest hidden sm:inline-block">DGC <span className="text-glow-shift-slow">Arcade</span></span>
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
                  <span className="font-mono font-bold text-primary text-sm">{formatCurrency(user.balance)}</span>
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 p-0">
                      <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center border border-primary/40 text-primary font-bold text-sm hover:border-primary transition-colors">
                        {(user?.username?.[0] || "?").toUpperCase()}
                      </div>
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
                    <DropdownMenuItem className="cursor-pointer" onClick={handleCreatorHubClick}>
                      <Star className="mr-2 h-4 w-4" />
                      <span>Creator Hub</span>
                      {isCreator && creatorUnread > 0 && (
                        <span className="ml-auto min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-black flex items-center justify-center px-1 animate-pulse">
                          {creatorUnread > 9 ? "9+" : creatorUnread}
                        </span>
                      )}
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

      {creatorApplyOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setCreatorApplyOpen(false)}>
          <div className="bg-card border border-border/60 rounded-2xl p-8 w-full max-w-sm shadow-2xl mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center"><Star className="w-5 h-5 text-purple-400" /></div>
                <div><h2 className="font-display font-black uppercase tracking-widest text-lg">Creator Hub</h2><p className="text-xs text-muted-foreground">Exclusive for approved creators</p></div>
              </div>
              <button onClick={() => setCreatorApplyOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">The Creator Hub is available to approved streamers and content creators on DGC Arcade.</p>
              <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-purple-400">How to Apply</p>
                <p className="text-xs text-muted-foreground leading-relaxed">Contact us via Discord or email <span className="text-foreground font-medium">support@dgcarcade.com</span> with your channel link and follower count.</p>
              </div>
              <button onClick={() => setCreatorApplyOpen(false)} className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-bold uppercase tracking-wider text-white transition-colors">Got it</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
