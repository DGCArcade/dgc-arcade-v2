import { useState, useEffect } from "react";
import { MapPin, Globe, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "dgc_geo_accepted";
const BLOCKED_COUNTRIES = ["GB", "FR", "NL", "AU", "BE", "DK", "DE", "IT", "RO", "ES", "SE", "CH", "CZ"];
const ALLOWED_US_STATES = ["Indiana", "Florida"];

type GeoState = "checking" | "asking" | "blocked_declined" | "blocked_country" | "blocked_state" | "accepted";

interface GeoInfo {
  country_code: string;
  country_name: string;
  city: string;
  region: string;
  ip: string;
}

export function LocationGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GeoState>("checking");
  const [geoInfo, setGeoInfo] = useState<GeoInfo | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "accepted") {
      setState("accepted");
      return;
    }
    if (stored === "declined") {
      setState("blocked_declined");
      return;
    }
    setState("asking");
  }, []);

  async function handleAccept() {
    try {
      const res = await fetch("https://ipapi.co/json/");
      const data: GeoInfo = await res.json();
      setGeoInfo(data);
      if (BLOCKED_COUNTRIES.includes(data.country_code)) {
        localStorage.setItem(STORAGE_KEY, "blocked_country");
        setState("blocked_country");
        return;
      }
      if (data.country_code === "US" && !ALLOWED_US_STATES.includes(data.region)) {
        localStorage.setItem(STORAGE_KEY, "blocked_state");
        setState("blocked_state");
        return;
      }
      localStorage.setItem(STORAGE_KEY, "accepted");
      localStorage.setItem("dgc_geo_country", data.country_code);
      localStorage.setItem("dgc_geo_city", data.city ?? "");
      localStorage.setItem("dgc_geo_ip", data.ip ?? "");
      setState("accepted");
    } catch {
      localStorage.setItem(STORAGE_KEY, "accepted");
      setState("accepted");
    }
  }

  function handleDecline() {
    localStorage.setItem(STORAGE_KEY, "declined");
    setState("blocked_declined");
  }

  if (state === "accepted") return <>{children}</>;

  if (state === "checking") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (state === "blocked_declined") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center gap-6">
        <ShieldAlert className="w-16 h-16 text-destructive" />
        <div>
          <h1 className="text-3xl font-display font-black uppercase tracking-tight text-destructive mb-2">Access Blocked</h1>
          <p className="text-muted-foreground max-w-md">
            DGC Arcade requires your consent to verify your location before you can access the Platform. This is required by our licensing obligations.
          </p>
        </div>
        <Button onClick={() => setState("asking")} variant="outline" className="gap-2">
          <MapPin className="w-4 h-4" /> Try Again
        </Button>
      </div>
    );
  }

  if (state === "blocked_country") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center gap-6">
        <ShieldAlert className="w-16 h-16 text-destructive" />
        <div>
          <h1 className="text-3xl font-display font-black uppercase tracking-tight mb-2">Region Restricted</h1>
          <p className="text-muted-foreground max-w-md">
            DGC Arcade is not available in your region ({geoInfo?.country_name ?? "your country"}) due to local gambling regulations. We apologize for the inconvenience.
          </p>
        </div>
        <div className="text-xs text-muted-foreground/60 max-w-sm">
          If you believe this is an error, contact <strong>support@dgcarcade.io</strong>
        </div>
      </div>
    );
  }

  if (state === "blocked_state") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center gap-6">
        <ShieldAlert className="w-16 h-16 text-destructive" />
        <div>
          <h1 className="text-3xl font-display font-black uppercase tracking-tight mb-2">State Restricted</h1>
          <p className="text-muted-foreground max-w-md">
            DGC Arcade is not available in {geoInfo?.region ?? "your state"} due to local gambling regulations. We apologize for the inconvenience.
          </p>
        </div>
        <div className="text-xs text-muted-foreground/60 max-w-sm">
          If you believe this is an error, contact <strong>support@dgcarcade.io</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />
      <div className="relative z-10 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-4 location-globe-glow">
            <Globe className="w-10 h-10 location-globe-icon" />
          </div>
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center font-display font-black text-primary-foreground text-xl">
              D
            </div>
            <span className="font-display font-bold text-2xl uppercase tracking-widest">DGC Arcade</span>
          </div>
          <p className="text-muted-foreground text-sm">Different Grind Crew</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 shadow-2xl space-y-5">
          <div>
            <h2 className="text-xl font-display font-black uppercase tracking-tight mb-2">Location Verification Required</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              DGC Arcade is a licensed gambling platform. To comply with our <strong className="text-foreground">Curaçao Gaming Authority</strong> license, we must verify your location before granting access.
            </p>
          </div>
          <div className="bg-secondary/40 rounded-xl p-4 space-y-2 text-xs text-muted-foreground">
            <div className="flex gap-2 items-start">
              <span className="text-green-400 mt-0.5">✓</span>
              <span>We will detect your country using your IP address</span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-green-400 mt-0.5">✓</span>
              <span>Your location data is stored securely and never sold</span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-green-400 mt-0.5">✓</span>
              <span>Access is denied in jurisdictions where gambling is prohibited</span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-yellow-400 mt-0.5">⚠</span>
              <span>You must be <strong className="text-foreground">18 years or older</strong> to access this platform</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground text-center">
            By clicking <strong className="text-foreground">I Accept</strong>, you confirm you are 18+ and consent to location verification per our{" "}
            <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>.
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 gap-2" onClick={handleDecline}>
              <X className="w-4 h-4" /> Decline
            </Button>
            <Button className="flex-1 gap-2 font-bold location-accept-btn" onClick={handleAccept}>
              <MapPin className="w-4 h-4" /> I Accept
            </Button>
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground/50 mt-4">
          Operated by Medium Rare N.V. · Curaçao Gaming License No. 8048/JAZ
        </p>
      </div>
    </div>
  );
}
