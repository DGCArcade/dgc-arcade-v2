import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/app-layout";
import { MobileGameProvider } from "@/hooks/use-mobile-game";
import { useEffect, Suspense, lazy, useMemo, useRef, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { usePlatformSettings } from "@/hooks/use-platform-settings";

// Lazy load heavy pages for better initial load
const Home = lazy(() => import("@/pages/home"));
const Games = lazy(() => import("@/pages/games"));
const SlotsPage = lazy(() => import("@/pages/slots"));
const SlotGamePage = lazy(() => import("@/pages/slot-game"));
const GamePage = lazy(() => import("@/pages/game"));
const Leaderboard = lazy(() => import("@/pages/leaderboard"));
const Profile = lazy(() => import("@/pages/profile"));
const Admin = lazy(() => import("@/pages/admin"));
const NotFound = lazy(() => import("@/pages/not-found"));
const RacePage = lazy(() => import("@/pages/race"));
const TermsPage = lazy(() => import("@/pages/terms"));
const PrivacyPage = lazy(() => import("@/pages/privacy"));
const ResponsibleGamblingPage = lazy(() => import("@/pages/responsible-gambling"));
const AmlPage = lazy(() => import("@/pages/aml"));
const Settings = lazy(() => import("@/pages/settings"));
const CreatorPage = lazy(() => import("@/pages/creator"));
const Maintenance = lazy(() => import("@/pages/maintenance"));
const ProvablyFairPage = lazy(() => import("./pages/provably-fair"));
const InstantPayoutsPage = lazy(() => import("./pages/instant-payouts"));
const CryptoNativePage = lazy(() => import("./pages/crypto-native"));

// Gate: if user is logged in but email not verified, block game access and force verification
function EmailVerifiedGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const fired = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    const unverified = user && !(user as any).emailVerified;
    if (unverified && !fired.current) {
      fired.current = true;
      window.dispatchEvent(new CustomEvent("openVerificationModal", { detail: { required: true } }));
    }
    if (!unverified) {
      fired.current = false;
    }
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-primary" />
      </div>
    );
  }
  if (user && !(user as any).emailVerified) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center gap-4">
        <div className="text-5xl">📧</div>
        <h2 className="font-display font-black text-2xl uppercase tracking-widest">Verify Your Email</h2>
        <p className="text-muted-foreground max-w-sm text-sm">
          You need to verify your email before you can play. Check your inbox for the 6-digit code.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-primary" />
    </div>
  );
}

// Optimized QueryClient with better defaults for performance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});

// Scroll to top whenever the route changes
function ScrollToTop() {
  const [location] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location]);

  // Live Tracking Beacon
  useEffect(() => {
    if (!user) return;
    const reportActivity = async () => {
      try {
        await fetch("/api/admin/report-activity", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${localStorage.getItem("dgc_token")}`
          },
          body: JSON.stringify({ page: location, timestamp: Date.now() })
        });
      } catch (e) {}
    };
    reportActivity();
    const interval = setInterval(reportActivity, 30000); // Heartbeat every 30s
    return () => clearInterval(interval);
  }, [location, user]);

  return null;
}

function Router() {
  const { settings, isLoading: settingsLoading } = usePlatformSettings();
  const { user } = useAuth();
  const isOwner = user ? (user.username ?? "").toLowerCase() === "fanodgc" : false;

  if (settingsLoading) return <PageLoader />;
  // Global Maintenance Mode lockout
  if (settings.maintenanceMode && !isOwner) {
    return (
      <AppLayout>
        <Maintenance />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <ScrollToTop />
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={Home} />
          
          {/* Feature Gated Routes — also require email verification */}
          <Route path="/games">
            {settings.gamesEnabled ? <EmailVerifiedGate><Games /></EmailVerifiedGate> : <NotFound />}
          </Route>
          
          <Route path="/slots">
            {settings.slotsEnabled ? <EmailVerifiedGate><SlotsPage /></EmailVerifiedGate> : <NotFound />}
          </Route>
          
          <Route path="/slots/:slug">
            {settings.slotsEnabled ? <EmailVerifiedGate><SlotGamePage /></EmailVerifiedGate> : <NotFound />}
          </Route>
          
          <Route path="/games/:gameId">
            {settings.gamesEnabled ? <EmailVerifiedGate><GamePage /></EmailVerifiedGate> : <NotFound />}
          </Route>
          
          <Route path="/race">
            {settings.raceEnabled ? <EmailVerifiedGate><RacePage /></EmailVerifiedGate> : <NotFound />}
          </Route>
          
          <Route path="/leaderboard">
            {settings.leaderboardEnabled ? <Leaderboard /> : <NotFound />}
          </Route>

          {/* Core App Routes */}
          <Route path="/profile" component={Profile} />
          <Route path="/admin/:tab" component={Admin} />
          <Route path="/admin" component={Admin} />
          <Route path="/settings" component={Settings} />
          <Route path="/creator" component={CreatorPage} />
          
          {/* Info Pages - also gated by maintenance but usually always available */}
          <Route path="/terms" component={TermsPage} />
          <Route path="/privacy" component={PrivacyPage} />
          <Route path="/responsible-gambling" component={ResponsibleGamblingPage} />
          <Route path="/aml" component={AmlPage} />
          <Route path="/provably-fair" component={ProvablyFairPage} />
          <Route path="/instant-payouts" component={InstantPayoutsPage} />
          <Route path="/crypto-native" component={CryptoNativePage} />
          
          {/* Catch-all 404 */}
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MobileGameProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </MobileGameProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
