import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { usePlatformSettings } from "@/hooks/use-platform-settings";

export default function NotFound() {
  const { settings } = usePlatformSettings();

  if (settings.custom404Enabled) {
    return (
      <div className="min-h-[60vh] w-full flex flex-col items-center justify-center p-8 text-center">
        <div className="max-w-lg w-full space-y-6">
          <div className="text-6xl font-display font-black text-primary/30">404</div>
          <h1 className="font-display font-black text-2xl md:text-3xl uppercase tracking-widest text-foreground">
            {settings.custom404Title}
          </h1>
          <p className="text-muted-foreground leading-relaxed">{settings.custom404Message}</p>
          <Link href={settings.custom404ButtonUrl || "/"}>
            <Button className="font-display font-bold uppercase tracking-widest">
              {settings.custom404ButtonText}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] w-full flex flex-col items-center justify-center p-8 text-center">
      <div className="max-w-lg w-full space-y-6">
        <div className="text-6xl font-display font-black text-primary/30">404</div>
        <h1 className="font-display font-black text-2xl uppercase tracking-widest">Page Not Found</h1>
        <p className="text-muted-foreground">
          The page at <span className="font-mono text-foreground/80 break-all">{typeof window !== "undefined" ? window.location.pathname : ""}</span> doesn't exist.
        </p>
        <Link href="/">
          <Button variant="outline" className="font-display font-bold uppercase tracking-widest">
            Back to Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
