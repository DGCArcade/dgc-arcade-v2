import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/app-layout";
import { useEffect, Suspense, lazy, useMemo } from "react";

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
const ProvablyFairPage = lazy(() => import("@/pages/provably-fair"));

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
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location]);
  return null;
}

function Router() {
  return (
    <AppLayout>
      <ScrollToTop />
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/games" component={Games} />
          <Route path="/slots" component={SlotsPage} />
          <Route path="/slots/:slug" component={SlotGamePage} />
          <Route path="/games/:gameId" component={GamePage} />
          <Route path="/race" component={RacePage} />
          <Route path="/leaderboard" component={Leaderboard} />
          <Route path="/profile" component={Profile} />
          {/* Admin with optional tab sub-route so reloads preserve the active tab */}
          <Route path="/admin/:tab" component={Admin} />
          <Route path="/admin" component={Admin} />
          <Route path="/terms" component={TermsPage} />
          <Route path="/privacy" component={PrivacyPage} />
          <Route path="/responsible-gambling" component={ResponsibleGamblingPage} />
          <Route path="/aml" component={AmlPage} />
          <Route path="/settings" component={Settings} />
          <Route path="/creator" component={CreatorPage} />
          <Route path="/provably-fair" component={ProvablyFairPage} />
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
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
