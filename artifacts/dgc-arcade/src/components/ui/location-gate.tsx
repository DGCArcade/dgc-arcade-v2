import { useState, useEffect, useRef } from "react";
import { MapPin, Globe, ShieldAlert, X, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { savePendingGeo } from "@/lib/geo-sync";

// Uses sessionStorage — shows on every new browser session, not cached forever
const SESSION_KEY = "dgc_geo_session_v2";

const BLOCKED_COUNTRIES = ["GB","FR","NL","AU","BE","DK","DE","IT","RO","ES","SE","CH","CZ"];
const ALLOWED_US_STATES = ["Indiana","Florida"];

type GeoState = "loading" | "asking" | "verifying" | "blocked_country" | "blocked_state" | "blocked_declined" | "accepted";

interface GeoData {
  ip: string;
  country_code: string;
  country_name: string;
  region: string;
  city: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  asn?: string;
  org?: string;
}

function collectFingerprint(): string {
  try {
    return [
      navigator.userAgent,
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      navigator.language,
      String(navigator.hardwareConcurrency ?? 0),
      String(navigator.maxTouchPoints ?? 0),
      navigator.platform ?? "",
    ].join("|");
  } catch { return "unknown"; }
}
// ── Device info parser ────────────────────────────────────────────
function parseBrowser(ua: string): string {
  if (/Edg\/([\d]+)/i.test(ua)) return `Edge ${ua.match(/Edg\/([\d]+)/i)![1]}`;
  if (/OPR\/([\d]+)/i.test(ua)) return `Opera ${ua.match(/OPR\/([\d]+)/i)![1]}`;
  if (/Firefox\/([\d]+)/i.test(ua)) return `Firefox ${ua.match(/Firefox\/([\d]+)/i)![1]}`;
  if (/Chrome\/([\d]+)/i.test(ua)) return `Chrome ${ua.match(/Chrome\/([\d]+)/i)![1]}`;
  if (/Version\/([\d]+)[^S]*Safari/i.test(ua)) return `Safari ${ua.match(/Version\/([\d]+)/i)![1]}`;
  if (/Safari/i.test(ua)) return "Safari";
  return "Unknown Browser";
}

function parseDevice(ua: string): { deviceName: string; deviceOs: string; deviceBrowser: string; deviceType: string } {
  const browser = parseBrowser(ua);

  // iPhone
  if (/iPhone/i.test(ua)) {
    const m = ua.match(/OS ([\d_]+)/i);
    return {
      deviceName: "iPhone",
      deviceOs: m ? `iOS ${m[1].replace(/_/g, ".")}` : "iOS",
      deviceBrowser: browser,
      deviceType: "mobile",
    };
  }

  // iPad (includes modern iPad that reports Macintosh)
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
    const m = ua.match(/OS ([\d_]+)/i);
    return {
      deviceName: "iPad",
      deviceOs: m ? `iPadOS ${m[1].replace(/_/g, ".")}` : "iPadOS",
      deviceBrowser: browser,
      deviceType: "tablet",
    };
  }

  // Android
  if (/Android/i.test(ua)) {
    const osMatch = ua.match(/Android ([\d.]+)/i);
    const modelMatch = ua.match(/;\s([^;)]+)\sBuild\//i);
    const os = osMatch ? `Android ${osMatch[1]}` : "Android";
    const deviceName = modelMatch ? modelMatch[1].trim() : "Android Device";
    const isMobile = /Mobile/i.test(ua);
    return { deviceName, deviceOs: os, deviceBrowser: browser, deviceType: isMobile ? "mobile" : "tablet" };
  }

  // Windows
  if (/Windows NT/i.test(ua)) {
    const m = ua.match(/Windows NT ([\d.]+)/i);
    const verMap: Record<string, string> = { "10.0": "Windows 10/11", "6.3": "Windows 8.1", "6.2": "Windows 8", "6.1": "Windows 7" };
    const os = m ? (verMap[m[1]] ?? `Windows NT ${m[1]}`) : "Windows";
    return { deviceName: "Windows PC", deviceOs: os, deviceBrowser: browser, deviceType: "desktop" };
  }

  // macOS
  if (/Macintosh|Mac OS X/i.test(ua)) {
    const m = ua.match(/Mac OS X ([\d_]+)/i);
    const os = m ? `macOS ${m[1].replace(/_/g, ".")}` : "macOS";
    return { deviceName: "Mac", deviceOs: os, deviceBrowser: browser, deviceType: "desktop" };
  }

  // Linux
  if (/Linux/i.test(ua)) {
    const arch = /x86_64/i.test(ua) ? "x86_64" : /aarch64|arm64/i.test(ua) ? "ARM64" : "x86";
    const distro = /Ubuntu/i.test(ua) ? "Ubuntu" : /Fedora/i.test(ua) ? "Fedora" : /Debian/i.test(ua) ? "Debian" : "Linux";
    return { deviceName: `${distro} (${arch})`, deviceOs: `Linux ${arch}`, deviceBrowser: browser, deviceType: "desktop" };
  }

  // Chrome OS
  if (/CrOS/i.test(ua)) {
    return { deviceName: "Chromebook", deviceOs: "Chrome OS", deviceBrowser: browser, deviceType: "desktop" };
  }

  return { deviceName: "Unknown Device", deviceOs: "Unknown OS", deviceBrowser: browser, deviceType: "desktop" };
}

// ── VPN / proxy detection ────────────────────────────────────────
interface VpnInfo { detected: boolean; signals: string[]; provider: string | null }

function detectVpn(geo: GeoData): VpnInfo {
  const signals: string[] = [];
  const orgLower = (geo.org ?? "").toLowerCase();

  // Signal 1: Known VPN provider in ASN/org name
  const VPN_KEYWORDS = [
    "nordvpn","expressvpn","mullvad","protonvpn","privateinternetaccess",
    "pia vpn","ipvanish","cyberghost","surfshark","tunnelbear","windscribe",
    "hidemyass"," hma ","purevpn","hotspot shield","torguard","vyprvpn",
    "perfect privacy","hide.me","astrill","ivpn","airvpn",
  ];
  const matchedVpn = VPN_KEYWORDS.find(k => orgLower.includes(k));
  if (matchedVpn) signals.push("known_vpn_provider");

  // Signal 2: Datacenter/hosting IP (not residential ISP)
  const DC_KEYWORDS = [
    "amazon","aws","google cloud","digitalocean","linode","vultr",
    "hetzner","ovh","m247","leaseweb","choopa","as-choopa","frantech",
    "quadranet","tzulo","psychz","serverius","hostwinds","buyvm",
  ];
  if (DC_KEYWORDS.some(k => orgLower.includes(k))) signals.push("datacenter_ip");

  // Signal 3: Timezone mismatch between browser and IP
  try {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const ipTz = geo.timezone ?? "";
    if (browserTz && ipTz && browserTz !== ipTz) {
      signals.push("timezone_mismatch");
    }
  } catch { /* ignore */ }

  // Signal 4: Tor exit node indicators
  if (orgLower.includes("tor ") || orgLower.includes("tor-") || orgLower.includes("torproject")) {
    signals.push("tor_exit_node");
  }

  const provider = matchedVpn
    ? matchedVpn.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()).trim()
    : signals.includes("tor_exit_node") ? "Tor" : null;

  return { detected: signals.length > 0, signals, provider };
}



export function LocationGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GeoState>("loading");
  const [geoData, setGeoData] = useState<GeoData | null>(null);
  const [geoReady, setGeoReady] = useState(false);
  const [geoFailed, setGeoFailed] = useState(false);
  const didFetch = useRef(false);

  useEffect(() => {
    if (didFetch.current) return;
    didFetch.current = true;

    // Check session — shows every new browser session
    const session = sessionStorage.getItem(SESSION_KEY);
    if (session === "accepted") { setState("accepted"); return; }
    if (session === "declined") { setState("blocked_declined"); return; }
    if (session === "blocked_country") { setState("blocked_country"); return; }
    if (session === "blocked_state") { setState("blocked_state"); return; }

    setState("asking");
    doGeoFetch();
  }, []);

  async function doGeoFetch() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      const res = await fetch("https://ipapi.co/json/", { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error("geo fetch failed");
      const data: GeoData = await res.json();
      if (!data.ip || !data.country_code) throw new Error("incomplete geo data");
      setGeoData(data);
      setGeoReady(true);
    } catch {
      setGeoFailed(true);
      setGeoReady(true); // allow accept anyway if fetch fails
    }
  }

  async function handleAccept() {
    // Try to get precise GPS location if available
    if (navigator.geolocation) {
      setState("verifying");
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          // Got precise location
          const { latitude, longitude } = position.coords;
          if (geoData) {
            setGeoData({
              ...geoData,
              latitude,
              longitude,
            });
          }
          await processAccept(latitude, longitude);
        },
        async () => {
          // Declined or error — proceed with IP geo
          await processAccept();
        },
        { timeout: 5000 }
      );
    } else {
      await processAccept();
    }
  }

  async function processAccept(gpsLat?: number, gpsLon?: number) {
    setState("verifying");
    try {
      // Block check
      if (geoData?.country_code && BLOCKED_COUNTRIES.includes(geoData.country_code)) {
        sessionStorage.setItem(SESSION_KEY, "blocked_country");
        setState("blocked_country");
        return;
      }
      if (geoData?.country_code === "US" && geoData?.region && !ALLOWED_US_STATES.includes(geoData.region)) {
        sessionStorage.setItem(SESSION_KEY, "blocked_state");
        setState("blocked_state");
        return;
      }

      // Mark accepted this session
      sessionStorage.setItem(SESSION_KEY, "accepted");

      // Save geo + fingerprint to backend (non-blocking)
      const fp = collectFingerprint();
      // Parse real device info from user agent
      const deviceInfo = parseDevice(navigator.userAgent);

      // Detect VPN signals
      const vpnInfo = geoData ? detectVpn(geoData) : { detected: false, signals: [], provider: null };

      const payload = geoData ? {
        country: geoData.country_name ?? "",
        countryCode: geoData.country_code ?? "",
        region: geoData.region ?? "",
        city: geoData.city ?? "",
        ip: geoData.ip ?? "",
        hostname: "",
        asn: geoData.asn ?? "",
        isp: geoData.org ?? "",
        lat: String(gpsLat ?? geoData.latitude ?? ""),
        lon: String(gpsLon ?? geoData.longitude ?? ""),
        timezone: geoData.timezone ?? "",
        deviceName: deviceInfo.deviceName,
        deviceOs: deviceInfo.deviceOs,
        deviceBrowser: deviceInfo.deviceBrowser,
        deviceType: deviceInfo.deviceType,
        vpnDetected: vpnInfo.detected,
        vpnProvider: vpnInfo.provider ?? "",
        fingerprint: fp,
      } : {};

      // Save to localStorage for reference
      localStorage.setItem("dgc_fp", fp);
      localStorage.setItem("dgc_device", deviceInfo.deviceName);
      if (vpnInfo.detected) localStorage.setItem("dgc_vpn", vpnInfo.provider ?? "detected");

      const token = localStorage.getItem("dgc_token");
      if (token) {
        fetch("/api/users/geo", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        }).catch(() => {}); // non-blocking
      } else if (geoData) {
        // Not logged in yet — stash the verified geo so it is flushed to the
        // account right after the user logs in or registers this session.
        savePendingGeo(payload);
      }

      setState("accepted");
    } catch {
      sessionStorage.setItem(SESSION_KEY, "accepted");
      setState("accepted");
    }
  }

  function handleDecline() {
    sessionStorage.setItem(SESSION_KEY, "declined");
    setState("blocked_declined");
  }

  function handleRetry() {
    sessionStorage.removeItem(SESSION_KEY);
    didFetch.current = false;
    setGeoData(null);
    setGeoReady(false);
    setGeoFailed(false);
    setState("asking");
    doGeoFetch();
  }

  // ── Pass through ───────────────────────────────────────────────
  if (state === "accepted") return <>{children}</>;

  // ── Spinners ───────────────────────────────────────────────────
  if (state === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (state === "verifying") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground uppercase tracking-widest font-bold">Verifying access…</p>
      </div>
    );
  }

  // ── Blocked: declined ──────────────────────────────────────────
  if (state === "blocked_declined") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center gap-6">
        <div className="w-20 h-20 rounded-2xl bg-destructive/10 border border-destructive/30 flex items-center justify-center">
          <ShieldAlert className="w-10 h-10 text-destructive" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-black uppercase tracking-tight text-destructive mb-2">Access Denied</h1>
          <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
            Location verification is required for platform compliance. You must consent to location verification before accessing the platform.
          </p>
        </div>
        <Button onClick={handleRetry} variant="outline" className="gap-2 font-bold">
          <MapPin className="w-4 h-4" /> Try Again
        </Button>
        <p className="text-xs text-muted-foreground/50">Questions? <strong>support@dgcarcade.io</strong></p>
      </div>
    );
  }

  // ── Blocked: country ───────────────────────────────────────────
  if (state === "blocked_country") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center gap-6">
        <div className="w-20 h-20 rounded-2xl bg-destructive/10 border border-destructive/30 flex items-center justify-center">
          <ShieldAlert className="w-10 h-10 text-destructive" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-black uppercase tracking-tight mb-2">Region Not Available</h1>
          <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
            DGC Arcade is not available in {geoData?.country_name ?? "your region"} due to local gambling regulations. We apologize for the inconvenience.
          </p>
        </div>
        <p className="text-xs text-muted-foreground/50">Questions? <strong>support@dgcarcade.io</strong></p>
      </div>
    );
  }

  // ── Blocked: state ─────────────────────────────────────────────
  if (state === "blocked_state") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center gap-6">
        <div className="w-20 h-20 rounded-2xl bg-destructive/10 border border-destructive/30 flex items-center justify-center">
          <ShieldAlert className="w-10 h-10 text-destructive" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-black uppercase tracking-tight mb-2">State Not Available</h1>
          <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
            DGC Arcade is not currently available in {geoData?.region ?? "your state"} due to local gambling regulations.
          </p>
        </div>
        <p className="text-xs text-muted-foreground/50">Questions? <strong>support@dgcarcade.io</strong></p>
      </div>
    );
  }

  // ── Main consent dialog ────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Space atmosphere */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse at 65% 20%, var(--theme-glow-strong, rgba(255,215,0,0.10)) 0%, transparent 55%), radial-gradient(ellipse at 25% 80%, rgba(80,40,200,0.07) 0%, transparent 50%)"
      }} />
      <div className="absolute inset-0 pointer-events-none opacity-20" style={{
        backgroundImage: "radial-gradient(1.5px 1.5px at 15% 25%, white 0%, transparent 100%), radial-gradient(1px 1px at 80% 15%, white 0%, transparent 100%), radial-gradient(2px 2px at 45% 55%, white 0%, transparent 100%), radial-gradient(1px 1px at 8% 65%, white 0%, transparent 100%), radial-gradient(1.5px 1.5px at 92% 45%, white 0%, transparent 100%), radial-gradient(1px 1px at 60% 80%, white 0%, transparent 100%), radial-gradient(1px 1px at 35% 10%, white 0%, transparent 100%)"
      }} />

      <div className="relative z-10 max-w-md w-full">
        {/* Logo header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-4"
            style={{ boxShadow: "0 0 40px rgba(255,215,0,0.15)" }}>
            <Globe className="w-10 h-10 text-primary" />
          </div>
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center font-display font-black text-primary-foreground text-xl">D</div>
            <span className="font-display font-bold text-2xl uppercase tracking-widest">DGC Arcade</span>
          </div>
          <p className="text-muted-foreground text-sm">DGC Arcade Limited</p>
        </div>

        {/* Consent card */}
        <div className="bg-card/95 border border-border rounded-2xl p-6 shadow-2xl space-y-5 backdrop-blur-sm">
          <div>
            <h2 className="text-xl font-display font-black uppercase tracking-tight mb-2">Location Verification Required</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              <strong className="text-foreground">DGC Arcade Limited</strong> is a licensed gaming platform. We verify your location before granting access.
            </p>
          </div>

          {/* Live geo status */}
          <div className={`flex items-center gap-2.5 text-xs px-3 py-2.5 rounded-xl border font-medium transition-all duration-500 ${
            geoReady && !geoFailed
              ? "bg-green-500/10 border-green-500/30 text-green-400"
              : geoFailed
              ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
              : "bg-secondary/60 border-border/50 text-muted-foreground"
          }`}>
            {!geoReady && <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />}
            {geoReady && !geoFailed && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />}
            {geoFailed && <MapPin className="w-3.5 h-3.5 flex-shrink-0" />}
            <span>
              {!geoReady && "Detecting your location…"}
              {geoReady && !geoFailed && `Location verified — ${geoData?.city ?? ""}${geoData?.city ? ", " : ""}${geoData?.country_code ?? ""}`}
              {geoFailed && "Location check timed out — you may proceed"}
            </span>
          </div>

          <div className="bg-secondary/40 rounded-xl p-4 space-y-2.5 text-xs text-muted-foreground">
            <div className="flex gap-2 items-start">
              <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
              <span>Your IP address and location are verified for licensing compliance</span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
              <span>Your data is stored securely and never sold to third parties</span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
              <span>Access is denied in jurisdictions where gambling is prohibited</span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-yellow-400 mt-0.5 flex-shrink-0">⚠</span>
              <span>You must be <strong className="text-foreground">18 years or older</strong> to access this platform</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            By clicking <strong className="text-foreground">I Accept & Continue</strong>, you confirm you are 18+ and consent to location verification, our{" "}
            <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>, and{" "}
            <a href="/terms" className="text-primary hover:underline">Terms of Service</a>.
          </p>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 gap-2" onClick={handleDecline}>
              <X className="w-4 h-4" /> Decline
            </Button>
            <Button
              className="flex-1 gap-2 font-bold transition-all duration-500"
              style={geoReady ? {
                boxShadow: "0 0 24px var(--theme-glow-strong, rgba(255,215,0,0.45)), 0 0 8px var(--theme-glow, rgba(255,215,0,0.25))"
              } : { opacity: 0.55 }}
              onClick={handleAccept}
              disabled={!geoReady}
            >
              {geoReady
                ? <><MapPin className="w-4 h-4" /> I Accept &amp; Continue</>
                : <><Loader2 className="w-4 h-4 animate-spin" /> Verifying Location…</>
              }
            </Button>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground/50 mt-4">
          Operated by DGC Arcade Limited
        </p>
      </div>
    </div>
  );
}
