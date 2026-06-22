import { useState, useEffect, useCallback } from "react";
import { Game, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { THEMES, getTheme, type ThemeId } from "@/lib/theme";

/* ─────────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────────── */
interface Card { suit: string; rank: string }
type Status = "idle" | "active" | "player_blackjack" | "player_wins" | "dealer_wins" | "push" | "player_bust";

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */
function getToken() { return localStorage.getItem("dgc_token"); }
function authHeaders() { return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }; }

function handTotal(hand: Card[]): number {
  let t = 0, a = 0;
  for (const c of hand) {
    const v = ["J","Q","K"].includes(c.rank) ? 10 : c.rank === "A" ? 11 : parseInt(c.rank);
    if (v === 11) a++;
    t += v;
  }
  while (t > 21 && a > 0) { t -= 10; a--; }
  return t;
}

/* ─────────────────────────────────────────────────────────────
   THEME FELT — dark readable felt per theme, never raw accent
───────────────────────────────────────────────────────────── */
const FELT_MAP: Record<ThemeId, { felt: string; rail: string; glow: string; text: string }> = {
  dgc:        { felt: "radial-gradient(ellipse at 50% 55%, #0d2b1a 0%, #071510 55%, #040d09 100%)", rail: "#1a4a2a", glow: "rgba(255,215,0,0.14)",   text: "rgba(255,215,0,0.20)" },
  cyber:      { felt: "radial-gradient(ellipse at 50% 55%, #001a0d 0%, #000f07 55%, #000804 100%)", rail: "#003d1a", glow: "rgba(0,255,65,0.12)",    text: "rgba(0,255,65,0.17)" },
  futuristic: { felt: "radial-gradient(ellipse at 50% 55%, #12062a 0%, #0a0318 55%, #060110 100%)", rail: "#2a0a5a", glow: "rgba(180,79,255,0.13)",  text: "rgba(180,79,255,0.20)" },
  blood:      { felt: "radial-gradient(ellipse at 50% 55%, #1a0505 0%, #0f0202 55%, #080101 100%)", rail: "#3d0a0a", glow: "rgba(255,30,30,0.12)",   text: "rgba(255,30,30,0.18)" },
  ocean:      { felt: "radial-gradient(ellipse at 50% 55%, #011a22 0%, #010f15 55%, #000a0f 100%)", rail: "#023a4a", glow: "rgba(0,210,220,0.12)",   text: "rgba(0,210,220,0.18)" },
  neon:       { felt: "radial-gradient(ellipse at 50% 55%, #1a0018 0%, #0f000f 55%, #080008 100%)", rail: "#3d0038", glow: "rgba(255,46,247,0.12)",  text: "rgba(255,46,247,0.18)" },
  volcanic:   { felt: "radial-gradient(ellipse at 50% 55%, #1a0800 0%, #0f0400 55%, #080200 100%)", rail: "#3d1200", glow: "rgba(255,85,0,0.12)",    text: "rgba(255,85,0,0.18)" },
  arctic:     { felt: "radial-gradient(ellipse at 50% 55%, #061520 0%, #030c15 55%, #020810 100%)", rail: "#0a2a40", glow: "rgba(168,223,255,0.12)", text: "rgba(168,223,255,0.18)" },
  midnight:   { felt: "radial-gradient(ellipse at 50% 55%, #0a0a0a 0%, #060606 55%, #030303 100%)", rail: "#1a1a1a", glow: "rgba(192,192,192,0.10)", text: "rgba(192,192,192,0.16)" },
};

function useFelt() {
  const [id, setId] = useState<ThemeId>(getTheme());
  useEffect(() => {
    const h = (e: Event) => setId((e as CustomEvent<ThemeId>).detail);
    window.addEventListener("dgc-theme-change", h);
    return () => window.removeEventListener("dgc-theme-change", h);
  }, []);
  return FELT_MAP[id] ?? FELT_MAP.dgc;
}

function useAccent() {
  const [id, setId] = useState<ThemeId>(getTheme());
  useEffect(() => {
    const h = (e: Event) => setId((e as CustomEvent<ThemeId>).detail);
    window.addEventListener("dgc-theme-change", h);
    return () => window.removeEventListener("dgc-theme-change", h);
  }, []);
  return THEMES.find(t => t.id === id)?.accent ?? "#FFD700";
}

/* ─────────────────────────────────────────────────────────────
   PLAYING CARD
───────────────────────────────────────────────────────────── */
function Card({ card, hidden, delay = 0 }: { card: Card; hidden?: boolean; delay?: number }) {
  const isRed = card.suit === "♥" || card.suit === "♦";
  const clr = isRed ? "#dc2626" : "#1a1a2e";

  return (
    <div style={{
      width: 58, height: 82, borderRadius: 7, flexShrink: 0, position: "relative",
      animation: `bj-deal 0.42s cubic-bezier(0.22,0.61,0.36,1) both`,
      animationDelay: `${delay}ms`,
      boxShadow: "0 5px 18px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.5)",
    }}>
      {hidden ? (
        <div style={{
          position: "absolute", inset: 0, borderRadius: 7, overflow: "hidden",
          background: "linear-gradient(145deg,#1e3a8a 0%,#1e1b4b 55%,#0c1445 100%)",
          border: "1.5px solid rgba(255,255,255,0.12)",
        }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(45deg,rgba(255,255,255,0.035) 0,rgba(255,255,255,0.035) 1px,transparent 1px,transparent 7px)" }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
            <div style={{ width: 16, height: 16, border: "1.5px solid rgba(255,255,255,0.15)", borderRadius: 2, transform: "rotate(45deg)" }} />
            <span style={{ fontSize: 5, fontWeight: 900, letterSpacing: 2, color: "rgba(255,255,255,0.2)" }}>DGC</span>
          </div>
        </div>
      ) : (
        <>
          <div style={{ position: "absolute", inset: 0, borderRadius: 7, background: "#fafafa", border: "1px solid #e0e0e0", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)" }} />
          <div style={{ position: "absolute", inset: 0 }}>
            <div style={{ position: "absolute", top: 4, left: 5 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: clr, lineHeight: 1 }}>{card.rank}</div>
              <div style={{ fontSize: 11, color: clr, lineHeight: 1 }}>{card.suit}</div>
            </div>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 26, color: clr, opacity: 0.09, userSelect: "none" }}>{card.suit}</span>
            </div>
            <div style={{ position: "absolute", bottom: 4, right: 5, transform: "rotate(180deg)" }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: clr, lineHeight: 1 }}>{card.rank}</div>
              <div style={{ fontSize: 11, color: clr, lineHeight: 1 }}>{card.suit}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SCORE BUBBLE — Duel-style pill with number
───────────────────────────────────────────────────────────── */
function ScoreBubble({ total, bust, bj, label }: { total: number; bust?: boolean; bj?: boolean; label: string }) {
  const bg = bust ? "rgba(239,68,68,0.22)" : bj ? "rgba(251,191,36,0.22)" : "rgba(8,12,28,0.88)";
  const border = bust ? "rgba(239,68,68,0.55)" : bj ? "rgba(251,191,36,0.55)" : "rgba(255,255,255,0.16)";
  const color = bust ? "#fca5a5" : bj ? "#fde047" : "#fff";
  const shadow = bust ? "0 0 14px rgba(239,68,68,0.35)" : bj ? "0 0 14px rgba(251,191,36,0.4)" : "0 2px 8px rgba(0,0,0,0.5)";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2.5, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{label}</span>
      <div style={{
        background: bg, border: `1.5px solid ${border}`, borderRadius: 22,
        padding: "4px 16px", boxShadow: shadow,
        display: "flex", alignItems: "center", gap: 5, minWidth: 52, justifyContent: "center",
      }}>
        <span style={{ fontSize: 20, fontWeight: 900, color, fontFamily: "monospace", lineHeight: 1 }}>
          {total > 0 ? total : "—"}
        </span>
        {bj && <span style={{ fontSize: 8, fontWeight: 800, color: "#fde047", letterSpacing: 0.5 }}>BJ!</span>}
        {bust && <span style={{ fontSize: 8, fontWeight: 800, color: "#fca5a5", letterSpacing: 0.5 }}>BUST</span>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   DECK PILE
───────────────────────────────────────────────────────────── */
function DeckPile() {
  return (
    <div style={{ position: "relative", width: 36, height: 50 }}>
      {[3, 2, 1, 0].map(i => (
        <div key={i} style={{
          position: "absolute", width: 36, height: 50, borderRadius: 5,
          background: "linear-gradient(145deg,#1e3a8a,#0c1445)",
          border: "1.5px solid rgba(255,255,255,0.1)",
          top: i * -1.5, left: i * 0.5, zIndex: i,
          boxShadow: i === 0 ? "0 3px 10px rgba(0,0,0,0.5)" : "none",
        }} />
      ))}
      <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
        <div style={{ width: 12, height: 12, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 2, transform: "rotate(45deg)" }} />
        <span style={{ fontSize: 4.5, fontWeight: 900, letterSpacing: 1.5, color: "rgba(255,255,255,0.2)" }}>DGC</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   EMPTY CARD SLOT
───────────────────────────────────────────────────────────── */
function EmptySlot() {
  return (
    <div style={{
      width: 58, height: 82, borderRadius: 7, flexShrink: 0,
      border: "1.5px dashed rgba(255,255,255,0.07)",
      background: "rgba(255,255,255,0.01)",
    }} />
  );
}

/* ─────────────────────────────────────────────────────────────
   ACTION BUTTON
───────────────────────────────────────────────────────────── */
function ActionBtn({ label, sub, onClick, disabled, bg, glow }: {
  label: string; sub?: string; onClick: () => void; disabled: boolean;
  bg: string; glow: string;
}) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      className="bj-action-btn"
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "7px 12px", borderRadius: 11, border: "1.5px solid rgba(255,255,255,0.14)",
        background: bg, color: "#fff", cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : `0 3px 16px ${glow}`,
        opacity: disabled ? 0.38 : 1, transition: "all 0.16s",
        minWidth: 58, gap: 1,
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase" }}>{label}</span>
      {sub && <span style={{ fontSize: 7.5, fontWeight: 600, color: "rgba(255,255,255,0.55)", letterSpacing: 0.8 }}>{sub}</span>}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   RESULT CONFIG
───────────────────────────────────────────────────────────── */
const RCFG: Record<string, { label: string; color: string; glow: string; rgb: string; emoji: string }> = {
  player_wins:      { label: "YOU WIN!",     color: "#22c55e", glow: "rgba(34,197,94,0.5)",   rgb: "34,197,94",   emoji: "🎉" },
  player_blackjack: { label: "BLACKJACK!",   color: "#fbbf24", glow: "rgba(251,191,36,0.55)", rgb: "251,191,36",  emoji: "🃏" },
  dealer_wins:      { label: "DEALER WINS",  color: "#ef4444", glow: "rgba(239,68,68,0.45)",  rgb: "239,68,68",   emoji: "💀" },
  push:             { label: "PUSH",         color: "#94a3b8", glow: "rgba(148,163,184,0.35)",rgb: "148,163,184", emoji: "🤝" },
  player_bust:      { label: "BUST!",        color: "#ef4444", glow: "rgba(239,68,68,0.45)",  rgb: "239,68,68",   emoji: "💥" },
};

/* ─────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────── */
interface BlackjackProps { game: Game }

export function Blackjack({ game }: BlackjackProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const felt = useFelt();
  const accent = useAccent();

  const minBet = parseFloat(String(game.minBet ?? 1));
  const maxBet = parseFloat(String(game.maxBet ?? 10000));

  const [amount, setAmount] = useState<number>(minBet);
  const [amountStr, setAmountStr] = useState<string>(String(minBet));
  const [handId, setHandId] = useState<number | null>(null);
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [playerTotal, setPlayerTotal] = useState(0);
  const [dealerTotal, setDealerTotal] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [payout, setPayout] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dealKey, setDealKey] = useState(0);
  const [currentBet, setCurrentBet] = useState(0);
  const [insuranceEligible, setInsuranceEligible] = useState(false);

  const isActive = status === "active";
  const isDone = !["idle", "active"].includes(status);
  const result = RCFG[status];
  const shownDealerTotal = dealerTotal ?? (isDone && dealerHand.length > 0 ? handTotal(dealerHand) : null);
  const dealerBust = shownDealerTotal !== null && shownDealerTotal > 21;
  const playerBust = playerTotal > 21;
  const playerBJ = status === "player_blackjack";
  const canDouble = isActive && playerHand.length === 2 && user && parseFloat(String(user.balance)) >= currentBet;
  const canSplit = isActive && playerHand.length === 2 && playerHand[0]?.rank === playerHand[1]?.rank && user && parseFloat(String(user.balance)) >= currentBet;
  const canInsure = isActive && insuranceEligible && playerHand.length === 2 && user && parseFloat(String(user.balance)) >= currentBet / 2;

  // Load active hand on mount
  useEffect(() => {
    fetch("/api/blackjack/current", { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        if (d?.handId) {
          setHandId(d.handId); setPlayerHand(d.playerHand); setDealerHand(d.dealerHand);
          setPlayerTotal(d.playerTotal); setStatus(d.status); setCurrentBet(d.bet ?? 0);
          setInsuranceEligible(d.insuranceEligible ?? false);
          setAmount(d.bet ?? minBet); setAmountStr(String(d.bet ?? minBet));
        }
      }).catch(() => {});
  }, []);

  const deal = useCallback(() => {
    requireAuth(async () => {
      if (!user || amount > parseFloat(String(user.balance))) {
        toast({ title: "Insufficient balance", variant: "destructive" }); return;
      }
      if (amount < minBet) {
        toast({ title: `Minimum bet is ${formatCurrency(minBet)}`, variant: "destructive" }); return;
      }
      setLoading(true);
      try {
        const r = await fetch("/api/blackjack/deal", {
          method: "POST", headers: authHeaders(),
          body: JSON.stringify({ gameId: game.id, amount }),
        });
        const d = await r.json();
        if (!r.ok) { toast({ title: `Error: ${d.error ?? JSON.stringify(d)}`, variant: "destructive" }); return; }
        setDealKey(k => k + 1);
        setHandId(d.handId); setPlayerHand(d.playerHand); setDealerHand(d.dealerHand);
        setPlayerTotal(d.playerTotal); setStatus(d.status); setPayout(d.payout ?? 0);
        setCurrentBet(amount); setInsuranceEligible(d.insuranceEligible ?? false);
        setDealerTotal(d.dealerTotal ?? null);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        if (d.status === "player_blackjack") {
          toast({ title: "BLACKJACK! 🃏", description: `Payout: ${formatCurrency(amount * 2.5)}`, className: "bg-yellow-500 text-black" });
        }
      } catch (e: any) {
        toast({ title: `Deal failed: ${e?.message ?? String(e)}`, variant: "destructive" });
      } finally { setLoading(false); }
    });
  }, [user, amount, game, minBet, requireAuth, toast, queryClient]);

  const doAction = useCallback(async (act: "hit" | "stand" | "double" | "split" | "insurance") => {
    if (!handId) return;
    setLoading(true);
    try {
      const r = await fetch("/api/blackjack/action", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ handId, action: act }),
      });
      const d = await r.json();
      if (!r.ok) { toast({ title: `Error: ${d.error ?? JSON.stringify(d)}`, variant: "destructive" }); return; }
      setPlayerHand(d.playerHand); setDealerHand(d.dealerHand);
      setPlayerTotal(d.playerTotal); setDealerTotal(d.dealerTotal ?? null);
      setStatus(d.status as Status); setPayout(d.payout ?? 0);
      if (act === "double" || act === "split") setCurrentBet(prev => prev * 2);
      if (act === "insurance") setInsuranceEligible(false);
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e: any) {
      toast({ title: `Failed: ${e?.message ?? String(e)}`, variant: "destructive" });
    } finally { setLoading(false); }
  }, [handId, toast, queryClient]);

  const reset = useCallback(() => {
    setHandId(null); setPlayerHand([]); setDealerHand([]);
    setPlayerTotal(0); setDealerTotal(null); setStatus("idle");
    setPayout(0); setCurrentBet(0); setInsuranceEligible(false);
  }, []);

  const handleAmountChange = (val: string) => {
    setAmountStr(val);
    const n = parseFloat(val.replace(/[^0-9.]/g, ""));
    if (!isNaN(n)) setAmount(Math.min(n, maxBet));
    else if (val === "" || val === ".") setAmount(0);
  };

  const handleAmountBlur = () => {
    const clamped = Math.max(minBet, Math.min(amount, maxBet));
    setAmount(clamped); setAmountStr(String(clamped));
  };

  const setAmt = (n: number) => { setAmount(n); setAmountStr(String(n)); };

  // Table glow on result
  const tableGlow = isDone && result
    ? `0 0 0 2px rgba(${result.rgb},0.35), 0 0 55px rgba(${result.rgb},0.15), 0 14px 45px rgba(0,0,0,0.7)`
    : `0 0 0 1px rgba(255,255,255,0.05), 0 14px 45px rgba(0,0,0,0.65)`;

  const chips = [1, 5, 25, 100, 500];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7, width: "100%", maxWidth: 500, margin: "0 auto" }}>

      {/* ── ANIMATIONS ─────────────────────────────────────── */}
      <style>{`
        @keyframes bj-deal {
          0%   { transform: translateY(-22px) scale(0.88) rotate(-4deg); opacity: 0; }
          100% { transform: translateY(0) scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes bj-pop {
          0%   { transform: scale(0.65) translateY(-8px); opacity: 0; }
          65%  { transform: scale(1.07); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes bj-win-pulse {
          0%,100% { box-shadow: 0 0 0 2px rgba(34,197,94,0.35), 0 0 40px rgba(34,197,94,0.12); }
          50%      { box-shadow: 0 0 0 2px rgba(34,197,94,0.65), 0 0 65px rgba(34,197,94,0.28); }
        }
        @keyframes bj-bj-pulse {
          0%,100% { box-shadow: 0 0 0 2px rgba(251,191,36,0.35), 0 0 40px rgba(251,191,36,0.12); }
          50%      { box-shadow: 0 0 0 2px rgba(251,191,36,0.65), 0 0 65px rgba(251,191,36,0.28); }
        }
        .bj-action-btn:hover:not(:disabled) { transform: translateY(-2px) scale(1.05) !important; filter: brightness(1.1); }
        .bj-action-btn:active:not(:disabled) { transform: scale(0.96) !important; }
        .bj-deal-btn:hover:not(:disabled) { filter: brightness(1.12); transform: scale(1.02); }
        .bj-deal-btn:active:not(:disabled) { transform: scale(0.97); }
        .bj-chip:hover:not(:disabled) { transform: scale(1.14) !important; }
        .bj-chip:active:not(:disabled) { transform: scale(0.94) !important; }
        .bj-mult:hover:not(:disabled) { background: rgba(255,255,255,0.12) !important; color: #fff !important; }
      `}</style>

      {/* ══════════════════════════════════════════════════════
          HALF-CIRCLE FELT TABLE
      ══════════════════════════════════════════════════════ */}
      <div style={{
        position: "relative", width: "100%",
        /* Half-circle shape: straight top, rounded bottom */
        borderRadius: "20px 20px 50% 50% / 20px 20px 38% 38%",
        overflow: "hidden",
        background: felt.felt,
        boxShadow: tableGlow,
        transition: "box-shadow 0.5s ease",
        paddingBottom: 18,
        animation: status === "player_wins" ? "bj-win-pulse 2.2s ease-in-out infinite" :
                   status === "player_blackjack" ? "bj-bj-pulse 2.2s ease-in-out infinite" : "none",
      }}>

        {/* Outer rail border */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 25,
          borderRadius: "20px 20px 50% 50% / 20px 20px 38% 38%",
          border: `3px solid ${felt.rail}`,
          boxShadow: `inset 0 0 30px rgba(0,0,0,0.4)`,
        }} />

        {/* Inner rail highlight */}
        <div style={{
          position: "absolute", inset: 5, pointerEvents: "none", zIndex: 24,
          borderRadius: "16px 16px 50% 50% / 16px 16px 38% 38%",
          border: `1px solid ${felt.rail}66`,
        }} />

        {/* Felt texture */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1,
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='3' height='3'%3E%3Ccircle cx='1' cy='1' r='0.4' fill='rgba(255,255,255,0.012)'/%3E%3C/svg%3E\")",
        }} />

        {/* Arc lines — half-circle curves like Duel */}
        <div style={{
          position: "absolute", bottom: "-15%", left: "50%", transform: "translateX(-50%)",
          width: "125%", height: "52%",
          borderRadius: "50%",
          border: `1px solid ${felt.text}`,
          pointerEvents: "none", zIndex: 3,
        }} />
        <div style={{
          position: "absolute", bottom: "-28%", left: "50%", transform: "translateX(-50%)",
          width: "148%", height: "58%",
          borderRadius: "50%",
          border: `1px solid ${felt.text}55`,
          pointerEvents: "none", zIndex: 3,
        }} />

        {/* Table inscription */}
        <div style={{
          position: "absolute", bottom: "20%", left: "50%", transform: "translateX(-50%)",
          zIndex: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
          pointerEvents: "none", whiteSpace: "nowrap",
        }}>
          <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: 3.5, color: felt.text, textTransform: "uppercase" }}>
            BLACKJACK PAYS 3 TO 2
          </span>
          <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: 5, color: felt.text, textTransform: "uppercase" }}>
            DGC
          </span>
          <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: 3.5, color: felt.text, textTransform: "uppercase" }}>
            INSURANCE PAYS 2 TO 1
          </span>
        </div>

        {/* Deck — top right */}
        <div style={{ position: "absolute", top: 10, right: 12, zIndex: 10, opacity: 0.85 }}>
          <DeckPile />
        </div>

        {/* Bet badge — top left */}
        {(isActive || isDone) && currentBet > 0 && (
          <div style={{
            position: "absolute", top: 10, left: 12, zIndex: 10,
            background: "rgba(0,0,0,0.65)", border: `1px solid ${accent}44`,
            borderRadius: 7, padding: "3px 9px",
            fontSize: 8, fontWeight: 700, color: accent, letterSpacing: 1.5, textTransform: "uppercase",
          }}>
            BET {formatCurrency(currentBet)}
          </div>
        )}

        {/* ── DEALER AREA ──────────────────────────────────── */}
        <div style={{
          position: "relative", zIndex: 10,
          display: "flex", flexDirection: "column", alignItems: "center",
          paddingTop: 16, paddingBottom: 8, gap: 8,
        }}>
          <ScoreBubble total={shownDealerTotal ?? 0} bust={dealerBust} bj={false} label="Dealer" />
          <div style={{
            display: "flex", gap: 5, justifyContent: "center", flexWrap: "wrap",
            minHeight: 82, alignItems: "center",
          }}>
            {status === "idle"
              ? <><EmptySlot /><EmptySlot /></>
              : dealerHand.map((c, i) => (
                <Card key={`${dealKey}-d${i}`} card={c} hidden={c.suit === "?"} delay={i * 90} />
              ))
            }
          </div>
        </div>

        {/* ── DIVIDER ──────────────────────────────────────── */}
        <div style={{
          position: "relative", zIndex: 10,
          margin: "0 auto", width: "75%", maxWidth: 280,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${felt.rail}, transparent)` }} />
          <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: 4, color: felt.text, textTransform: "uppercase" }}>vs</span>
          <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${felt.rail}, transparent)` }} />
        </div>

        {/* ── PLAYER AREA ──────────────────────────────────── */}
        <div style={{
          position: "relative", zIndex: 10,
          display: "flex", flexDirection: "column", alignItems: "center",
          paddingTop: 8, paddingBottom: 6, gap: 8,
        }}>
          <div style={{
            display: "flex", gap: 5, justifyContent: "center", flexWrap: "wrap",
            minHeight: 82, alignItems: "center",
          }}>
            {status === "idle"
              ? <><EmptySlot /><EmptySlot /></>
              : playerHand.map((c, i) => (
                <Card key={`${dealKey}-p${i}`} card={c} delay={i * 90 + 55} />
              ))
            }
          </div>
          <ScoreBubble total={playerTotal} bust={playerBust} bj={playerBJ} label="You" />
        </div>

        {/* ── RESULT ───────────────────────────────────────── */}
        {isDone && result && (
          <div style={{
            position: "relative", zIndex: 15,
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 3, paddingBottom: 6,
            animation: "bj-pop 0.48s cubic-bezier(0.34,1.56,0.64,1) both",
          }}>
            <div style={{
              fontSize: 22, fontWeight: 900, textTransform: "uppercase",
              color: result.color, letterSpacing: 4,
              textShadow: `0 0 18px ${result.glow}, 0 0 36px ${result.glow}`,
              fontFamily: "'Outfit', sans-serif",
            }}>
              {result.emoji} {result.label}
            </div>
            {payout > 0 && status !== "push" && (
              <div style={{ fontSize: 14, fontWeight: 700, color: "#22c55e", letterSpacing: 1, fontFamily: "monospace", textShadow: "0 0 10px rgba(34,197,94,0.5)" }}>
                +{formatCurrency(payout)}
              </div>
            )}
            {status === "push" && (
              <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", letterSpacing: 0.8 }}>
                Bet returned · {formatCurrency(currentBet)}
              </div>
            )}
          </div>
        )}

        {/* ── ACTION BUTTONS — always visible in table ─────── */}
        {isActive && (
          <div style={{
            position: "relative", zIndex: 15,
            display: "flex", gap: 5, justifyContent: "center", flexWrap: "wrap",
            paddingBottom: 12, paddingTop: 2, paddingLeft: 8, paddingRight: 8,
          }}>
            <ActionBtn label="Hit"    sub="+1 Card"              onClick={() => doAction("hit")}       disabled={loading} bg="linear-gradient(140deg,#16a34a,#15803d)" glow="rgba(22,163,74,0.5)" />
            <ActionBtn label="Stand"  sub="Hold"                 onClick={() => doAction("stand")}     disabled={loading} bg="linear-gradient(140deg,#dc2626,#b91c1c)" glow="rgba(220,38,38,0.5)" />
            {canDouble && (
              <ActionBtn label="Double" sub={`+${formatCurrency(currentBet)}`} onClick={() => doAction("double")} disabled={loading} bg="linear-gradient(140deg,#7c3aed,#6d28d9)" glow="rgba(124,58,237,0.5)" />
            )}
            {canSplit && (
              <ActionBtn label="Split"  sub="2 Hands"            onClick={() => doAction("split")}     disabled={loading} bg="linear-gradient(140deg,#0891b2,#0e7490)" glow="rgba(8,145,178,0.5)" />
            )}
            {canInsure && (
              <ActionBtn label="Insure" sub={`${formatCurrency(currentBet/2)}`} onClick={() => doAction("insurance")} disabled={loading} bg="linear-gradient(140deg,#d97706,#b45309)" glow="rgba(217,119,6,0.5)" />
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          BET PANEL
      ══════════════════════════════════════════════════════ */}
      <div style={{
        background: "rgba(8,12,26,0.88)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 16, padding: "11px 12px",
        display: "flex", flexDirection: "column", gap: 9,
        backdropFilter: "blur(14px)",
      }}>

        {/* Row 1: Bet input + multipliers */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 110, position: "relative" }}>
            <span style={{
              position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)",
              color: "rgba(255,255,255,0.28)", fontFamily: "monospace", fontSize: 12, fontWeight: 700,
              pointerEvents: "none",
            }}>$</span>
            <input
              type="text" inputMode="decimal"
              value={amountStr}
              onChange={e => handleAmountChange(e.target.value)}
              onBlur={handleAmountBlur}
              disabled={isActive}
              placeholder={String(minBet)}
              style={{
                width: "100%", paddingLeft: 22, paddingRight: 8, paddingTop: 8, paddingBottom: 8,
                fontSize: 13, fontWeight: 700, fontFamily: "monospace",
                background: "rgba(255,255,255,0.05)",
                border: `1px solid ${isActive ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.11)"}`,
                borderRadius: 9, color: "#fff", outline: "none",
                opacity: isActive ? 0.55 : 1,
              }}
            />
          </div>
          {[
            { l: "½",   fn: () => setAmt(Math.max(minBet, Math.floor((amount / 2) * 100) / 100)) },
            { l: "2×",  fn: () => setAmt(Math.min(amount * 2, maxBet)) },
            { l: "MIN", fn: () => setAmt(minBet) },
            { l: "MAX", fn: () => setAmt(Math.min(parseFloat(String(user?.balance ?? 0)), maxBet)) },
          ].map(({ l, fn }) => (
            <button key={l} onClick={fn} disabled={isActive}
              className="bj-mult"
              style={{
                padding: "7px 9px", borderRadius: 7, fontSize: 9, fontWeight: 700, letterSpacing: 1,
                textTransform: "uppercase", background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.6)",
                cursor: isActive ? "not-allowed" : "pointer", transition: "all 0.14s",
                opacity: isActive ? 0.38 : 1,
              }}>{l}</button>
          ))}
        </div>

        {/* Row 2: Chips */}
        <div style={{ display: "flex", gap: 5, justifyContent: "center", alignItems: "center" }}>
          {chips.map(chip => (
            <button key={chip}
              className="bj-chip"
              onClick={() => { if (!isActive) setAmt(Math.min(amount + chip, maxBet)); }}
              disabled={isActive}
              style={{
                width: 40, height: 40, borderRadius: "50%",
                background: `radial-gradient(circle at 35% 35%, ${accent}1e, ${accent}08)`,
                border: `2px solid ${accent}50`,
                color: "#fff", fontSize: 8.5, fontWeight: 900, fontFamily: "monospace",
                cursor: isActive ? "not-allowed" : "pointer",
                boxShadow: isActive ? "none" : `0 0 9px ${accent}2e, inset 0 1px 0 rgba(255,255,255,0.1)`,
                opacity: isActive ? 0.32 : 1, transition: "all 0.14s",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
            >
              {chip >= 1000 ? `${chip / 1000}K` : chip}
            </button>
          ))}
          <button
            onClick={() => { if (!isActive) setAmt(0); }}
            disabled={isActive}
            style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "rgba(239,68,68,0.07)", border: "2px solid rgba(239,68,68,0.28)",
              color: "rgba(239,68,68,0.65)", fontSize: 13, fontWeight: 900,
              cursor: isActive ? "not-allowed" : "pointer",
              opacity: isActive ? 0.32 : 1, transition: "all 0.14s",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >✕</button>
        </div>

        {/* Row 3: Odds + Deal/Play Again */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          {/* Odds info */}
          <div style={{ display: "flex", gap: 8, fontSize: 8.5, fontFamily: "monospace", color: "rgba(255,255,255,0.32)", flexWrap: "wrap" }}>
            <span style={{ color: "rgba(251,191,36,0.75)" }}>BJ 3:2</span>
            <span>·</span>
            <span style={{ color: "rgba(34,197,94,0.75)" }}>Win 1:1</span>
            <span>·</span>
            <span style={{ color: "rgba(148,163,184,0.6)" }}>Ins 2:1</span>
            <span>·</span>
            <span style={{ color: "rgba(148,163,184,0.45)" }}>HE ~0.5%</span>
          </div>

          {/* Deal / Play Again / Edit Bet */}
          {status === "idle" ? (
            <button
              className="bj-deal-btn"
              onClick={deal}
              disabled={loading || amount < minBet}
              style={{
                padding: "9px 24px", borderRadius: 11,
                fontWeight: 900, fontSize: 12, letterSpacing: 3, textTransform: "uppercase",
                background: `linear-gradient(140deg, ${accent}ee, ${accent}aa)`,
                color: "#000", border: "none",
                cursor: loading || amount < minBet ? "not-allowed" : "pointer",
                boxShadow: loading || amount < minBet ? "none" : `0 4px 18px ${accent}50`,
                opacity: loading || amount < minBet ? 0.48 : 1,
                transition: "all 0.16s", minWidth: 90,
                fontFamily: "'Outfit', sans-serif",
              }}
            >
              {loading ? "Dealing…" : "DEAL"}
            </button>
          ) : isDone ? (
            <div style={{ display: "flex", gap: 5 }}>
              <button
                className="bj-deal-btn"
                onClick={deal}
                disabled={loading}
                style={{
                  padding: "9px 18px", borderRadius: 11,
                  fontWeight: 900, fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
                  background: `linear-gradient(140deg, ${accent}ee, ${accent}aa)`,
                  color: "#000", border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  boxShadow: loading ? "none" : `0 4px 18px ${accent}50`,
                  opacity: loading ? 0.48 : 1, transition: "all 0.16s",
                  fontFamily: "'Outfit', sans-serif",
                }}
              >
                {loading ? "…" : "▶ PLAY AGAIN"}
              </button>
              <button
                onClick={reset}
                style={{
                  padding: "9px 12px", borderRadius: 11,
                  fontWeight: 700, fontSize: 10, letterSpacing: 1, textTransform: "uppercase",
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.55)", cursor: "pointer", transition: "all 0.14s",
                }}
              >
                EDIT BET
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
