import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/app-layout";

import Home from "@/pages/home";
import Games from "@/pages/games";
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

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/games" component={Games} />
        <Route path="/games/:gameId" component={GamePage} />
        <Route path="/race" component={RacePage} />
        <Route path="/leaderboard" component={Leaderboard} />
        <Route path="/profile" component={Profile} />
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
