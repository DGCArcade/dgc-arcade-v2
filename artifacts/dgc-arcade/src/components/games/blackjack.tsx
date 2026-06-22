import { useState, useEffect, useCallback, useRef } from "react";
import { Game, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { THEMES, getTheme, type ThemeId } from "@/lib/theme";

interface Card { suit: string; rank: string }
type Status = "idle" | "active" | "player_blackjack" | "player_wins" | "dealer_wins" | "push" | "player_bust";

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

const FELT_MAP: Record<ThemeId, { felt: string; rail: string; glow: string; text: string }> = {
  dgc:        { felt: "radial-gradient(ellipse at 50% 40%, #0d2b1a 0%, #071510 50%, #040d09 100%)", rail: "#1a4a2a", glow: "rgba(255,215,0,0.14)",   text: "rgba(255,215,0,0.20)" },
  cyber:      { felt: "radial-gradient(ellipse at 50% 40%, #001a0d 0%, #000f07 50%, #000804 100%)", rail: "#003d1a", glow: "rgba(0,255,65,0.12)",    text: "rgba(0,255,65,0.17)" },
  futuristic: { felt: "radial-gradient(ellipse at 50% 40%, #12062a 0%, #0a0318 50%, #060110 100%)", rail: "#2a0a5a", glow: "rgba(180,79,255,0.13)",  text: "rgba(180,79,255,0.20)" },
  blood:      { felt: "radial-gradient(ellipse at 50% 40%, #1a0505 0%, #0f0202 50%, #080101 100%)", rail: "#3d0a0a", glow: "rgba(255,30,30,0.12)",   text: "rgba(255,30,30,0.18)" },
  ocean:      { felt: "radial-gradient(ellipse at 50% 40%, #011a22 0%, #010f15 50%, #000a0f 100%)", rail: "#023a4a", glow: "rgba(0,210,220,0.12)",   text: "rgba(0,210,220,0.18)" },
  neon:       { felt: "radial-gradient(ellipse at 50% 40%, #1a0018 0%, #0f000f 50%, #080008 100%)", rail: "#3d0038", glow: "rgba(255,46,247,0.12)",  text: "rgba(255,46,247,0.18)" },
  volcanic:   { felt: "radial-gradient(ellipse at 50% 40%, #1a0800 0%, #0f0400 50%, #080200 100%)", rail: "#3d1200", glow: "rgba(255,85,0,0.12)",    text: "rgba(255,85,0,0.18)" },
  arctic:     { felt: "radial-gradient(ellipse at 50% 40%, #061520 0%, #030c15 50%, #020810 100%)", rail: "#0a2a40", glow: "rgba(168,223,255,0.12)", text: "rgba(168,223,255,0.18)" },
  midnight:   { felt: "radial-gradient(ellipse at 50% 40%, #0a0a0a 0%, #060606 50%, #030303 100%)", rail: "#1a1a1a", glow: "rgba(192,192,192,0.10)", text: "rgba(192,192,192,0.16)" },
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

function PlayingCard({ card, hidden, dealFrom, delay = 0 }: { 
  card: Card; hidden?: boolean; dealFrom?: { x: number; y: number }; delay?: number 
}) {
  const isRed = card.suit === "♥" || card.suit === "♦";
  const clr = isRed ? "#dc2626" : "#1a1a2e";
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dealFrom && cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      const startX = dealFrom.x - rect.left;
      const startY = dealFrom.y - rect.top;
      
      cardRef.current.style.setProperty("--deal-start-x", `${startX}px`);
      cardRef.current.style.setProperty("--deal-start-y", `${startY}px`);
      cardRef.current.style.animation = `bj-deal-fly 0.6s cubic-bezier(0.25,0.46,0.45,0.94) both`;
      cardRef.current.style.animationDelay = `${delay}ms`;
    }
  }, [dealFrom, delay]);

  return (
    <div ref={cardRef} style={{
      width: 90, height: 126, borderRadius: 9, flexShrink: 0, position: "relative",
      boxShadow: "0 8px 28px rgba(0,0,0,0.85), 0 3px 8px rgba(0,0,0,0.6)",
    }}>
      {hidden ? (
        <div style={{
          position: "absolute", inset: 0, borderRadius: 9, overflow: "hidden",
          background: "linear-gradient(145deg,#1e3a8a 0%,#1e1b4b 55%,#0c1445 100%)",
          border: "2px solid rgba(255,255,255,0.15)",
          boxShadow: "inset 0 2px 6px rgba(0,0,0,0.6)",
        }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(45deg,rgba(255,255,255,0.04) 0,rgba(255,255,255,0.04) 1px,transparent 1px,transparent 8px)" }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
            <div style={{ width: 20, height: 20, border: "1.5px solid rgba(255,255,255,0.16)", borderRadius: 2, transform: "rotate(45deg)" }} />
            <span style={{ fontSize: 5.5, fontWeight: 900, letterSpacing: 1.8, color: "rgba(255,255,255,0.22)" }}>DGC ARCADE</span>
          </div>
        </div>
      ) : (
        <>
          <div style={{ position: "absolute", inset: 0, borderRadius: 9, background: "#fafafa", border: "1.5px solid #e0e0e0", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.08)" }} />
          <div style={{ position: "absolute", inset: 0, padding: "5px" }}>
            <div style={{ position: "absolute", top: 4, left: 5 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: clr, lineHeight: 1 }}>{card.rank}</div>
              <div style={{ fontSize: 14, color: clr, lineHeight: 0.9 }}>{card.suit}</div>
            </div>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 40, color: clr, opacity: 0.08, userSelect: "none" }}>{card.suit}</span>
            </div>
            <div style={{ position: "absolute", bottom: 4, right: 5, transform: "rotate(180deg)" }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: clr, lineHeight: 1 }}>{card.rank}</div>
              <div style={{ fontSize: 14, color: clr, lineHeight: 0.9 }}>{card.suit}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ScoreBubble({ total, bust, bj, label }: { total: number; bust?: boolean; bj?: boolean; label: string }) {
  const bg = bust ? "rgba(239,68,68,0.25)" : bj ? "rgba(251,191,36,0.25)" : "rgba(8,12,28,0.90)";
  const border = bust ? "rgba(239,68,68,0.60)" : bj ? "rgba(251,191,36,0.60)" : "rgba(255,255,255,0.18)";
  const color = bust ? "#fca5a5" : bj ? "#fde047" : "#fff";
  const shadow = bust ? "0 0 20px rgba(239,68,68,0.40)" : bj ? "0 0 20px rgba(251,191,36,0.45)" : "0 4px 12px rgba(0,0,0,0.6)";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2.5, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>{label}</span>
      <div style={{
        background: bg, border: `2px solid ${border}`, borderRadius: 26,
        padding: "5px 20px", boxShadow: shadow,
        display: "flex", alignItems: "center", gap: 6, minWidth: 72, justifyContent: "center",
      }}>
        <span style={{ fontSize: 26, fontWeight: 900, color, fontFamily: "monospace", lineHeight: 1 }}>
          {total > 0 ? total : "—"}
        </span>
        {bj && <span style={{ fontSize: 9, fontWeight: 800, color: "#fde047", letterSpacing: 0.8 }}>BJ!</span>}
        {bust && <span style={{ fontSize: 9, fontWeight: 800, color: "#fca5a5", letterSpacing: 0.8 }}>BUST</span>}
      </div>
    </div>
  );
}

function DeckPile() {
  return (
    <div style={{ position: "relative", width: 60, height: 84 }}>
      {[4, 3, 2, 1, 0].map(i => (
        <div key={i} style={{
          position: "absolute", width: 60, height: 84, borderRadius: 7,
          background: "linear-gradient(145deg,#1e3a8a,#0c1445)",
          border: "1.5px solid rgba(255,255,255,0.12)",
          top: i * -2.5, left: i * 1, zIndex: i,
          boxShadow: i === 0 ? "0 5px 15px rgba(0,0,0,0.7)" : "none",
        }} />
      ))}
      <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
        <div style={{ width: 18, height: 18, border: "1.5px solid rgba(255,255,255,0.14)", borderRadius: 2, transform: "rotate(45deg)" }} />
        <span style={{ fontSize: 5, fontWeight: 900, letterSpacing: 1.5, color: "rgba(255,255,255,0.20)" }}>DGC ARCADE</span>
      </div>
    </div>
  );
}

function EmptySlot() {
  return (
    <div style={{
      width: 90, height: 126, borderRadius: 9, flexShrink: 0,
      border: "2px dashed rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.01)",
    }} />
  );
}

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
        padding: "8px 14px", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.14)",
        background: bg, color: "#fff", cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : `0 5px 20px ${glow}`,
        opacity: disabled ? 0.40 : 1, transition: "all 0.16s",
        minWidth: 72, gap: 1.5, fontFamily: "'Outfit', sans-serif", fontSize: 11, fontWeight: 900,
      }}
    >
      <span style={{ letterSpacing: 2, textTransform: "uppercase" }}>{label}</span>
      {sub && <span style={{ fontSize: 8, fontWeight: 600, color: "rgba(255,255,255,0.55)", letterSpacing: 0.8 }}>{sub}</span>}
    </button>
  );
}

const RCFG: Record<string, { label: string; color: string; glow: string; rgb: string; emoji: string }> = {
  player_wins:      { label: "YOU WIN!",     color: "#22c55e", glow: "rgba(34,197,94,0.5)",   rgb: "34,197,94",   emoji: "🎉" },
  player_blackjack: { label: "BLACKJACK!",   color: "#fbbf24", glow: "rgba(251,191,36,0.55)", rgb: "251,191,36",  emoji: "🃏" },
  dealer_wins:      { label: "DEALER WINS",  color: "#ef4444", glow: "rgba(239,68,68,0.45)",  rgb: "239,68,68",   emoji: "💀" },
  push:             { label: "PUSH",         color: "#94a3b8", glow: "rgba(148,163,184,0.35)",rgb: "148,163,184", emoji: "🤝" },
  player_bust:      { label: "BUST!",        color: "#ef4444", glow: "rgba(239,68,68,0.45)",  rgb: "239,68,68",   emoji: "💥" },
};

interface BlackjackProps { game: Game }

export function Blackjack({ game }: BlackjackProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const felt = useFelt();
  const accent = useAccent();
  const deckRef = useRef<HTMLDivElement>(null);

  const minBet = parseFloat(String(game.minBet ?? 0.01));
  const maxBet = parseFloat(String(game.maxBet ?? 1000000));

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
  const [dealingCards, setDealingCards] = useState<number[]>([]);

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
      setDealingCards([0, 1, 2, 3]);
      try {
        const r = await fetch("/api/blackjack/deal", {
          method: "POST", headers: authHeaders(),
          body: JSON.stringify({ gameId: game.id, amount }),
        });
        const d = await r.json();
        if (!r.ok) { toast({ title: `Error: ${d.error ?? JSON.stringify(d)}`, variant: "destructive" }); return; }
        
        setTimeout(() => {
          setDealKey(k => k + 1);
          setHandId(d.handId); setPlayerHand(d.playerHand); setDealerHand(d.dealerHand);
          setPlayerTotal(d.playerTotal); setStatus(d.status); setPayout(d.payout ?? 0);
          setCurrentBet(amount); setInsuranceEligible(d.insuranceEligible ?? false);
          setDealerTotal(d.dealerTotal ?? null);
          setDealingCards([]);
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          if (d.status === "player_blackjack") {
            toast({ title: "BLACKJACK! 🃏", description: `Payout: ${formatCurrency(amount * 2.5)}`, className: "bg-yellow-500 text-black" });
          }
        }, 600);
      } catch (e: any) {
        toast({ title: `Deal failed: ${e?.message ?? String(e)}`, variant: "destructive" });
        setDealingCards([]);
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

  const tableGlow = isDone && result
    ? `0 0 0 3px rgba(${result.rgb},0.40), 0 0 80px rgba(${result.rgb},0.20), 0 20px 50px rgba(0,0,0,0.75)`
    : `0 0 0 2px rgba(255,255,255,0.06), 0 20px 50px rgba(0,0,0,0.70)`;

  const chips = [1, 5, 25, 100, 500];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: "100%", padding: "12px" }}>

      <style>{`
        @keyframes bj-deal-fly {
          0% {
            transform: translate(var(--deal-start-x, 0), var(--deal-start-y, 0)) scale(0.7) rotateY(90deg);
            opacity: 0;
          }
          50% {
            transform: translate(var(--deal-start-x, 0), var(--deal-start-y, 0)) scale(0.85) rotateY(45deg);
            opacity: 0.8;
          }
          100% {
            transform: translate(0, 0) scale(1) rotateY(0deg);
            opacity: 1;
          }
        }
        @keyframes bj-pop {
          0%   { transform: scale(0.6) translateY(-12px); opacity: 0; }
          65%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes bj-win-pulse {
          0%,100% { box-shadow: 0 0 0 3px rgba(34,197,94,0.35), 0 0 50px rgba(34,197,94,0.15); }
          50%      { box-shadow: 0 0 0 3px rgba(34,197,94,0.70), 0 0 80px rgba(34,197,94,0.35); }
        }
        @keyframes bj-bj-pulse {
          0%,100% { box-shadow: 0 0 0 3px rgba(251,191,36,0.35), 0 0 50px rgba(251,191,36,0.15); }
          50%      { box-shadow: 0 0 0 3px rgba(251,191,36,0.70), 0 0 80px rgba(251,191,36,0.35); }
        }
        .bj-action-btn:hover:not(:disabled) { transform: translateY(-2px) scale(1.05) !important; filter: brightness(1.1); }
        .bj-action-btn:active:not(:disabled) { transform: scale(0.94) !important; }
        .bj-deal-btn:hover:not(:disabled) { filter: brightness(1.12); transform: scale(1.02); }
        .bj-deal-btn:active:not(:disabled) { transform: scale(0.96); }
        .bj-chip:hover:not(:disabled) { transform: scale(1.14) !important; }
        .bj-chip:active:not(:disabled) { transform: scale(0.92) !important; }
        .bj-mult:hover:not(:disabled) { background: rgba(255,255,255,0.12) !important; color: #fff !important; }
      `}</style>

      {/* TABLE */}
      <div style={{
        position: "relative", width: "100%",
        borderRadius: "24px 24px 50% 50% / 24px 24px 38% 38%",
        overflow: "hidden",
        background: felt.felt,
        boxShadow: tableGlow,
        transition: "box-shadow 0.5s ease",
        paddingBottom: 20,
        paddingTop: 20,
        minHeight: 480,
        animation: status === "player_wins" ? "bj-win-pulse 2.2s ease-in-out infinite" :
                   status === "player_blackjack" ? "bj-bj-pulse 2.2s ease-in-out infinite" : "none",
      }}>

        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 25,
          borderRadius: "24px 24px 50% 50% / 24px 24px 38% 38%",
          border: `3px solid ${felt.rail}`,
          boxShadow: `inset 0 0 35px rgba(0,0,0,0.5)`,
        }} />

        <div style={{
          position: "absolute", inset: 5, pointerEvents: "none", zIndex: 24,
          borderRadius: "20px 20px 50% 50% / 20px 20px 38% 38%",
          border: `1.5px solid ${felt.rail}66`,
        }} />

        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1,
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Ccircle cx='1' cy='1' r='0.4' fill='rgba(255,255,255,0.012)'/%3E%3C/svg%3E\")",
        }} />

        <div style={{
          position: "absolute", bottom: "-14%", left: "50%", transform: "translateX(-50%)",
          width: "122%", height: "50%",
          borderRadius: "50%",
          border: `1.5px solid ${felt.text}`,
          pointerEvents: "none", zIndex: 3,
        }} />
        <div style={{
          position: "absolute", bottom: "-26%", left: "50%", transform: "translateX(-50%)",
          width: "148%", height: "55%",
          borderRadius: "50%",
          border: `1px solid ${felt.text}55`,
          pointerEvents: "none", zIndex: 3,
        }} />

        <div style={{
          position: "absolute", bottom: "16%", left: "50%", transform: "translateX(-50%)",
          zIndex: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5,
          pointerEvents: "none", whiteSpace: "nowrap",
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3.5, color: felt.text, textTransform: "uppercase" }}>
            BLACKJACK PAYS 3 TO 2
          </span>
          <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 5, color: felt.text, textTransform: "uppercase" }}>
            DGC ARCADE
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3.5, color: felt.text, textTransform: "uppercase" }}>
            INSURANCE PAYS 2 TO 1
          </span>
        </div>

        <div ref={deckRef} style={{ position: "absolute", top: 12, right: 16, zIndex: 10, opacity: 0.90 }}>
          <DeckPile />
        </div>

        {(isActive || isDone) && currentBet > 0 && (
          <div style={{
            position: "absolute", top: 12, left: 16, zIndex: 10,
            background: "rgba(0,0,0,0.70)", border: `1.5px solid ${accent}55`,
            borderRadius: 8, padding: "4px 11px",
            fontSize: 10, fontWeight: 700, color: accent, letterSpacing: 1.8, textTransform: "uppercase",
          }}>
            BET {formatCurrency(currentBet)}
          </div>
        )}

        {/* DEALER */}
        <div style={{
          position: "relative", zIndex: 10,
          display: "flex", flexDirection: "column", alignItems: "center",
          paddingTop: 6, paddingBottom: 12, gap: 10,
        }}>
          <ScoreBubble total={shownDealerTotal ?? 0} bust={dealerBust} bj={false} label="Dealer" />
          <div style={{
            display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap",
            minHeight: 126, alignItems: "center",
          }}>
            {status === "idle"
              ? <><EmptySlot /><EmptySlot /></>
              : dealerHand.map((c, i) => (
                <PlayingCard 
                  key={`${dealKey}-d${i}`} 
                  card={c} 
                  hidden={c.suit === "?"} 
                  dealFrom={dealingCards.includes(i + 1) && deckRef.current ? {
                    x: deckRef.current.getBoundingClientRect().left + 30,
                    y: deckRef.current.getBoundingClientRect().top + 42,
                  } : undefined}
                  delay={dealingCards.includes(i + 1) ? (i + 1) * 150 : 0}
                />
              ))
            }
          </div>
        </div>

        {/* DIVIDER */}
        <div style={{
          position: "relative", zIndex: 10,
          margin: "0 auto", width: "70%", maxWidth: 350,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ flex: 1, height: 1.5, background: `linear-gradient(90deg, transparent, ${felt.rail}, transparent)` }} />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 4, color: felt.text, textTransform: "uppercase" }}>vs</span>
          <div style={{ flex: 1, height: 1.5, background: `linear-gradient(90deg, transparent, ${felt.rail}, transparent)` }} />
        </div>

        {/* PLAYER */}
        <div style={{
          position: "relative", zIndex: 10,
          display: "flex", flexDirection: "column", alignItems: "center",
          paddingTop: 12, paddingBottom: 6, gap: 10,
        }}>
          <div style={{
            display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap",
            minHeight: 126, alignItems: "center",
          }}>
            {status === "idle"
              ? <><EmptySlot /><EmptySlot /></>
              : playerHand.map((c, i) => (
                <PlayingCard 
                  key={`${dealKey}-p${i}`} 
                  card={c} 
                  dealFrom={dealingCards.includes(i + 2) && deckRef.current ? {
                    x: deckRef.current.getBoundingClientRect().left + 30,
                    y: deckRef.current.getBoundingClientRect().top + 42,
                  } : undefined}
                  delay={dealingCards.includes(i + 2) ? (i + 2) * 150 : 0}
                />
              ))
            }
          </div>
          <ScoreBubble total={playerTotal} bust={playerBust} bj={playerBJ} label="You" />
        </div>

        {/* RESULT */}
        {isDone && result && (
          <div style={{
            position: "relative", zIndex: 15,
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 3, paddingBottom: 6, paddingTop: 6,
            animation: "bj-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
          }}>
            <div style={{
              fontSize: 28, fontWeight: 900, textTransform: "uppercase",
              color: result.color, letterSpacing: 4,
              textShadow: `0 0 20px ${result.glow}, 0 0 40px ${result.glow}`,
              fontFamily: "'Outfit', sans-serif",
            }}>
              {result.emoji} {result.label}
            </div>
            {payout > 0 && status !== "push" && (
              <div style={{ fontSize: 16, fontWeight: 700, color: "#22c55e", letterSpacing: 1.2, fontFamily: "monospace", textShadow: "0 0 12px rgba(34,197,94,0.6)" }}>
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

        {/* ACTIONS */}
        {isActive && (
          <div style={{
            position: "relative", zIndex: 15,
            display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap",
            paddingBottom: 12, paddingTop: 3, paddingLeft: 10, paddingRight: 10,
          }}>
            <ActionBtn label="Hit"    sub="+1"                  onClick={() => doAction("hit")}       disabled={loading} bg="linear-gradient(140deg,#16a34a,#15803d)" glow="rgba(22,163,74,0.5)" />
            <ActionBtn label="Stand"  sub="Hold"                onClick={() => doAction("stand")}     disabled={loading} bg="linear-gradient(140deg,#dc2626,#b91c1c)" glow="rgba(220,38,38,0.5)" />
            {canDouble && (
              <ActionBtn label="Double" sub={`+$${currentBet}`} onClick={() => doAction("double")} disabled={loading} bg="linear-gradient(140deg,#7c3aed,#6d28d9)" glow="rgba(124,58,237,0.5)" />
            )}
            {canSplit && (
              <ActionBtn label="Split"  sub="2x"                onClick={() => doAction("split")}     disabled={loading} bg="linear-gradient(140deg,#0891b2,#0e7490)" glow="rgba(8,145,178,0.5)" />
            )}
            {canInsure && (
              <ActionBtn label="Insure" sub={`$${(currentBet/2).toFixed(0)}`} onClick={() => doAction("insurance")} disabled={loading} bg="linear-gradient(140deg,#d97706,#b45309)" glow="rgba(217,119,6,0.5)" />
            )}
          </div>
        )}
      </div>

      {/* BET PANEL */}
      <div style={{
        background: "rgba(8,12,26,0.88)",
        border: "1.5px solid rgba(255,255,255,0.07)",
        borderRadius: 14, padding: "11px 12px",
        display: "flex", flexDirection: "column", gap: 10,
        backdropFilter: "blur(14px)",
      }}>

        {/* Row 1: Bet input + multipliers */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 120, position: "relative" }}>
            <span style={{
              position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
              color: "rgba(255,255,255,0.28)", fontFamily: "monospace", fontSize: 13, fontWeight: 700,
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
                width: "100%", paddingLeft: 25, paddingRight: 10, paddingTop: 9, paddingBottom: 9,
                fontSize: 13, fontWeight: 700, fontFamily: "monospace",
                background: "rgba(255,255,255,0.05)",
                border: `1.5px solid ${isActive ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.11)"}`,
                borderRadius: 8, color: "#fff", outline: "none",
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
                padding: "8px 10px", borderRadius: 7, fontSize: 9, fontWeight: 700, letterSpacing: 1.2,
                textTransform: "uppercase", background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.6)",
                cursor: isActive ? "not-allowed" : "pointer", transition: "all 0.14s",
                opacity: isActive ? 0.38 : 1,
              }}>{l}</button>
          ))}
        </div>

        {/* Row 2: Chips */}
        <div style={{ display: "flex", gap: 5, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
          {chips.map(chip => (
            <button key={chip}
              className="bj-chip"
              onClick={() => { if (!isActive) setAmt(Math.min(amount + chip, maxBet)); }}
              disabled={isActive}
              title={`Add $${chip}`}
              style={{
                width: 44, height: 44, borderRadius: "50%",
                background: `radial-gradient(circle at 35% 35%, ${accent}1e, ${accent}08)`,
                border: `2px solid ${accent}50`,
                color: "#fff", fontSize: 9, fontWeight: 900, fontFamily: "monospace",
                cursor: isActive ? "not-allowed" : "pointer",
                boxShadow: isActive ? "none" : `0 0 10px ${accent}2e, inset 0 1px 0 rgba(255,255,255,0.1)`,
                opacity: isActive ? 0.32 : 1, transition: "all 0.14s",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
            >
              ${chip >= 1000 ? `${chip / 1000}K` : chip}
            </button>
          ))}
          <button
            onClick={() => { if (!isActive) setAmt(0); }}
            disabled={isActive}
            title="Clear bet"
            style={{
              width: 44, height: 44, borderRadius: "50%",
              background: "rgba(239,68,68,0.07)", border: "2px solid rgba(239,68,68,0.28)",
              color: "rgba(239,68,68,0.65)", fontSize: 14, fontWeight: 900,
              cursor: isActive ? "not-allowed" : "pointer",
              opacity: isActive ? 0.32 : 1, transition: "all 0.14s",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >✕</button>
        </div>

        {/* Row 3: Odds + Deal */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, fontSize: 8.5, fontFamily: "monospace", color: "rgba(255,255,255,0.32)", flexWrap: "wrap" }}>
            <span style={{ color: "rgba(251,191,36,0.75)" }}>BJ 3:2</span>
            <span>·</span>
            <span style={{ color: "rgba(34,197,94,0.75)" }}>Win 1:1</span>
            <span>·</span>
            <span style={{ color: "rgba(148,163,184,0.6)" }}>Ins 2:1</span>
            <span>·</span>
            <span style={{ color: "rgba(148,163,184,0.45)" }}>HE ~0.5%</span>
          </div>

          {status === "idle" ? (
            <button
              className="bj-deal-btn"
              onClick={deal}
              disabled={loading || amount < minBet}
              style={{
                padding: "9px 22px", borderRadius: 10,
                fontWeight: 900, fontSize: 11, letterSpacing: 3, textTransform: "uppercase",
                background: `linear-gradient(140deg, ${accent}ee, ${accent}aa)`,
                color: "#000", border: "none",
                cursor: loading || amount < minBet ? "not-allowed" : "pointer",
                boxShadow: loading || amount < minBet ? "none" : `0 4px 16px ${accent}50`,
                opacity: loading || amount < minBet ? 0.48 : 1,
                transition: "all 0.16s", minWidth: 85,
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
                  padding: "9px 16px", borderRadius: 10,
                  fontWeight: 900, fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
                  background: `linear-gradient(140deg, ${accent}ee, ${accent}aa)`,
                  color: "#000", border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  boxShadow: loading ? "none" : `0 4px 16px ${accent}50`,
                  opacity: loading ? 0.48 : 1, transition: "all 0.16s",
                  fontFamily: "'Outfit', sans-serif",
                }}
              >
                {loading ? "…" : "▶ PLAY"}
              </button>
              <button
                onClick={reset}
                style={{
                  padding: "9px 11px", borderRadius: 10,
                  fontWeight: 700, fontSize: 9, letterSpacing: 1, textTransform: "uppercase",
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.55)", cursor: "pointer", transition: "all 0.14s",
                }}
              >
                EDIT
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
