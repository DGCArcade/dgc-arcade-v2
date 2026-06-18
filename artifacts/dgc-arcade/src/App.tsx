import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/app-layout";
import { useEffect } from "react";

import Home from "@/pages/home";
import Games from "@/pages/games";
import SlotsPage from "@/pages/slots";
import SlotGamePage from "@/pages/slot-game";
import GamePage from "@/pages/game";
import Leaderboard from "@/pages/leaderboard";
import Profile from "@/pages/profile";
import Admin from "@/pages/admin";
import NotFound from "@/pages/not-found";
import RacePage from "@/pages/race";
import TermsPage from "@/pages/terms";
import PrivacyPage from "@/pages/privacy";
import ResponsibleGamblingPage from "@/pages/responsible-gambling";
import AmlPage from "@/pages/aml";
import Settings from "@/pages/settings";
import CreatorPage from "@/pages/creator";

const queryClient = new QueryClient();

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
        <Route component={NotFound} />
      </Switch>
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
