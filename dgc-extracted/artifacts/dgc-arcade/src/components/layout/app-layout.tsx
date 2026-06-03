import { ReactNode } from "react";
import { Navbar } from "./navbar";
import { AuthModal } from "@/components/auth/auth-modal";
import { StarBackground } from "@/components/ui/star-background";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground selection:bg-primary/30 relative">
      <StarBackground />
      <div className="relative z-10 flex flex-col min-h-[100dvh]">
        <Navbar />
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col">
          {children}
        </main>
        <footer className="py-6 text-center border-t border-border/30 mt-auto bg-background/60 backdrop-blur-sm">
          <p className="text-xs font-display uppercase tracking-widest text-muted-foreground/60">
            © {new Date().getFullYear()} DGC Arcade · Different Grind Crew · Play Responsibly
          </p>
        </footer>
        <AuthModal />
      </div>
    </div>
  );
}
