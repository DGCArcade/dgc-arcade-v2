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
    if (c.suit === "?") continue;
    const v = ["J","Q","K"].includes(c.rank) ? 10 : c.rank === "A" ? 11 : parseInt(c.rank);
    if (v === 11) a++;
    t += v;
  }
  while (t > 21 && a > 0) { t -= 10; a--; }
  return t;
}

const FELT_MAP: Record<ThemeId, { felt: string; rail: string; glow: string; text: string }> = {
  dgc:        { felt: "#0d2b1a", rail: "#1a4a2a", glow: "rgba(255,215,0,0.14)",   text: "rgba(255,215,0,0.20)" },
  cyber:      { felt: "#001a0d", rail: "#003d1a", glow: "rgba(0,255,65,0.12)",    text: "rgba(0,255,65,0.17)" },
  futuristic: { felt: "#12062a", rail: "#2a0a5a", glow: "rgba(180,79,255,0.13)",  text: "rgba(180,79,255,0.20)" },
  blood:      { felt: "#1a0505", rail: "#3d0a0a", glow: "rgba(255,30,30,0.12)",   text: "rgba(255,30,30,0.18)" },
  ocean:      { felt: "#011a22", rail: "#023a4a", glow: "rgba(0,210,220,0.12)",   text: "rgba(0,210,220,0.18)" },
  neon:       { felt: "#1a0018", rail: "#3d0038", glow: "rgba(255,46,247,0.12)",  text: "rgba(255,46,247,0.18)" },
  volcanic:   { felt: "#1a0800", rail: "#3d1200", glow: "rgba(255,85,0,0.12)",    text: "rgba(255,85,0,0.18)" },
  arctic:     { felt: "#061520", rail: "#0a2a40", glow: "rgba(168,223,255,0.12)", text: "rgba(168,223,255,0.18)" },
  midnight:   { felt: "#0a0a0a", rail: "#1a1a1a", glow: "rgba(192,192,192,0.10)", text: "rgba(192,192,192,0.16)" },
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

// ─── Card Component with Flip Animation ───
function PlayingCard({ card, hidden, delay = 0, dealFrom }: { 
  card: Card; hidden?: boolean; delay?: number; dealFrom?: { x: number; y: number } 
}) {
  const isRed = card.suit === "♥" || card.suit === "♦";
  const clr = isRed ? "#dc2626" : "#1a1a2e";
  const cardRef = useRef<HTMLDivElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (dealFrom && cardRef.current && !hasAnimated) {
      const rect = cardRef.current.getBoundingClientRect();
      const startX = dealFrom.x - rect.left;
      const startY = dealFrom.y - rect.top;
      
      cardRef.current.style.setProperty("--deal-start-x", `${startX}px`);
      cardRef.current.style.setProperty("--deal-start-y", `${startY}px`);
      cardRef.current.style.animation = `bj-card-deal 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) both`;
      cardRef.current.style.animationDelay = `${delay}ms`;
      setHasAnimated(true);
    }
  }, [dealFrom, delay, hasAnimated]);

  return (
    <div ref={cardRef} className="bj-card-container" style={{
      width: 85, height: 118, borderRadius: 8, position: "relative",
      perspective: 1000,
    }}>
      <div className={`bj-card-inner ${hidden ? "is-hidden" : ""}`} style={{
        position: "absolute", width: "100%", height: "100%",
        transition: "transform 0.6s", transformStyle: "preserve-3d",
      }}>
        {/* Card Back */}
        <div style={{
          position: "absolute", width: "100%", height: "100%", backfaceVisibility: "hidden",
          borderRadius: 8, overflow: "hidden",
          background: "linear-gradient(145deg, #1e3a8a 0%, #0c1445 100%)",
          border: "2px solid rgba(255,255,255,0.15)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3
        }}>
          <div style={{ width: 22, height: 22, border: "1.5px solid rgba(255,255,255,0.16)", borderRadius: 3, transform: "rotate(45deg)" }} />
          <span style={{ fontSize: 6, fontWeight: 900, letterSpacing: 1.5, color: "rgba(255,255,255,0.25)" }}>DGC ARCADE</span>
        </div>
        
        {/* Card Front */}
        <div style={{
          position: "absolute", width: "100%", height: "100%", backfaceVisibility: "hidden",
          borderRadius: 8, background: "#fafafa", border: "1.5px solid #e0e0e0",
          transform: "rotateY(180deg)", boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          padding: 6, display: "flex", flexDirection: "column", justifyContent: "space-between"
        }}>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: clr, lineHeight: 1 }}>{card.rank}</div>
            <div style={{ fontSize: 14, color: clr, lineHeight: 1 }}>{card.suit}</div>
          </div>
          <div style={{ alignSelf: "center", fontSize: 32, color: clr, opacity: 0.15 }}>{card.suit}</div>
          <div style={{ textAlign: "right", transform: "rotate(180deg)" }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: clr, lineHeight: 1 }}>{card.rank}</div>
            <div style={{ fontSize: 14, color: clr, lineHeight: 1 }}>{card.suit}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreBubble({ total, bust, bj, label, side }: { total: number; bust?: boolean; bj?: boolean; label: string; side: "left" | "right" }) {
  const bg = bust ? "rgba(239,68,68,0.2)" : bj ? "rgba(251,191,36,0.2)" : "rgba(0,0,0,0.6)";
  const border = bust ? "rgba(239,68,68,0.5)" : bj ? "rgba(251,191,36,0.5)" : "rgba(255,255,255,0.1)";
  const color = bust ? "#fca5a5" : bj ? "#fde047" : "#fff";

  return (
    <div style={{
      position: "absolute", top: side === "left" ? "20%" : "65%", [side]: -40,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4, zIndex: 30
    }}>
      <div style={{
        background: bg, border: `1.5px solid ${border}`, borderRadius: 12,
        padding: "6px 14px", backdropFilter: "blur(8px)", minWidth: 65, textAlign: "center",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
      }}>
        <div style={{ fontSize: 8, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 900, color, fontFamily: "monospace" }}>{total > 0 ? total : "—"}</div>
      </div>
    </div>
  );
}

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
  const [currentBet, setCurrentBet] = useState(0);
  const [insuranceEligible, setInsuranceEligible] = useState(false);
  const [animatingCards, setAnimatingCards] = useState(false);

  const isActive = status === "active";
  const isDone = !["idle", "active"].includes(status);
  
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
      setLoading(true); setAnimatingCards(true);
      try {
        const r = await fetch("/api/blackjack/deal", {
          method: "POST", headers: authHeaders(),
          body: JSON.stringify({ gameId: game.id, amount }),
        });
        const d = await r.json();
        if (!r.ok) { toast({ title: d.error, variant: "destructive" }); return; }
        
        // Wait for animation to finish
        setTimeout(() => {
          setHandId(d.handId); setPlayerHand(d.playerHand); setDealerHand(d.dealerHand);
          setPlayerTotal(d.playerTotal); setStatus(d.status); setPayout(d.payout ?? 0);
          setCurrentBet(amount); setInsuranceEligible(d.insuranceEligible ?? false);
          setDealerTotal(d.dealerTotal ?? null);
          setAnimatingCards(false);
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        }, 1200);
      } catch (e: any) {
        setAnimatingCards(false);
        toast({ title: "Deal failed", variant: "destructive" });
      } finally { setLoading(false); }
    });
  }, [user, amount, game, requireAuth, toast, queryClient]);

  const doAction = useCallback(async (act: "hit" | "stand" | "double" | "split" | "insurance") => {
    if (!handId) return;
    setLoading(true);
    try {
      const r = await fetch("/api/blackjack/action", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ handId, action: act }),
      });
      const d = await r.json();
      if (!r.ok) { toast({ title: d.error, variant: "destructive" }); return; }
      
      setPlayerHand(d.playerHand); setDealerHand(d.dealerHand);
      setPlayerTotal(d.playerTotal); setDealerTotal(d.dealerTotal ?? null);
      setStatus(d.status as Status); setPayout(d.payout ?? 0);
      if (act === "double" || act === "split") setCurrentBet(prev => prev * 2);
      if (act === "insurance") setInsuranceEligible(false);
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e: any) {
      toast({ title: "Action failed", variant: "destructive" });
    } finally { setLoading(false); }
  }, [handId, toast, queryClient]);

  const reset = () => {
    setHandId(null); setPlayerHand([]); setDealerHand([]);
    setPlayerTotal(0); setDealerTotal(null); setStatus("idle");
    setPayout(0); setCurrentBet(0); setInsuranceEligible(false);
  };

  const handleAmountChange = (val: string) => {
    setAmountStr(val);
    const n = parseFloat(val.replace(/[^0-9.]/g, ""));
    if (!isNaN(n)) setAmount(Math.min(n, maxBet));
  };

  return (
    <div style={{ display: "flex", flexDirection: "row", gap: 12, width: "100%", padding: "12px", alignItems: "flex-start" }}>
      <style>{`
        @keyframes bj-card-deal {
          0% { transform: translate(var(--deal-start-x, 0), var(--deal-start-y, 0)) rotate(45deg); opacity: 0; }
          100% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
        }
        .bj-card-inner.is-hidden { transform: rotateY(0deg) !important; }
        .bj-card-inner:not(.is-hidden) { transform: rotateY(180deg); }
        .bj-action-btn { transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .bj-action-btn:hover:not(:disabled) { transform: translateY(-3px) scale(1.05); filter: brightness(1.1); }
        .bj-action-btn:active:not(:disabled) { transform: scale(0.95); }
      `}</style>

      {/* ── TABLE AREA ── */}
      <div style={{
        flex: 1, position: "relative", minHeight: 520, borderRadius: 24,
        background: `radial-gradient(ellipse at 50% 10%, ${felt.felt} 0%, #050505 100%)`,
        border: `4px solid ${felt.rail}`, boxShadow: "0 20px 50px rgba(0,0,0,0.8)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
        padding: "40px 20px", overflow: "hidden"
      }}>
        {/* Table Decoration */}
        <div style={{
          position: "absolute", top: "15%", width: "80%", height: "70%",
          border: `2px solid ${felt.text}`, borderRadius: "50%", opacity: 0.3, pointerEvents: "none"
        }} />
        <div style={{
          position: "absolute", top: "45%", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: 0.5, pointerEvents: "none"
        }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 4, color: felt.text }}>BLACKJACK PAYS 3 TO 2</div>
          <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 8, color: felt.text }}>DGC ARCADE</div>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 4, color: felt.text }}>INSURANCE PAYS 2 TO 1</div>
        </div>

        {/* Deck on Top Right */}
        <div ref={deckRef} style={{ position: "absolute", top: 20, right: 30, width: 70, height: 100 }}>
          {[3, 2, 1, 0].map(i => (
            <div key={i} style={{
              position: "absolute", width: 70, height: 100, borderRadius: 6,
              background: "linear-gradient(145deg, #1e3a8a, #0c1445)",
              border: "1px solid rgba(255,255,255,0.2)",
              top: i * -1.5, right: i * 1, zIndex: 5 - i,
              boxShadow: "0 4px 10px rgba(0,0,0,0.5)"
            }} />
          ))}
        </div>

        {/* Dealer Hand */}
        <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center", gap: 10 }}>
          <ScoreBubble total={dealerTotal ?? (isDone ? handTotal(dealerHand) : 0)} bust={dealerTotal !== null && dealerTotal > 21} label="DEALER" side="left" />
          <div style={{ display: "flex", gap: 10, minHeight: 118 }}>
            {dealerHand.length > 0 ? dealerHand.map((c, i) => (
              <PlayingCard key={`d-${i}`} card={c} hidden={c.suit === "?"} delay={i * 200} dealFrom={deckRef.current?.getBoundingClientRect()} />
            )) : <div style={{ width: 85, height: 118, border: "2px dashed rgba(255,255,255,0.05)", borderRadius: 8 }} />}
          </div>
        </div>

        {/* Result Overlay */}
        {isDone && (
          <div style={{
            zIndex: 50, textAlign: "center", background: "rgba(0,0,0,0.8)", padding: "10px 30px", borderRadius: 16,
            border: `2px solid ${accent}`, boxShadow: `0 0 30px ${accent}44`, animation: "bj-card-deal 0.5s both"
          }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: accent, letterSpacing: 2 }}>{status.replace("_", " ").toUpperCase()}</div>
            {payout > 0 && <div style={{ fontSize: 18, fontWeight: 900, color: "#22c55e" }}>+{formatCurrency(payout)}</div>}
          </div>
        )}

        {/* Player Hand */}
        <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center", gap: 10 }}>
          <ScoreBubble total={playerTotal} bust={playerTotal > 21} bj={status === "player_blackjack"} label="PLAYER" side="right" />
          <div style={{ display: "flex", gap: 10, minHeight: 118 }}>
            {playerHand.length > 0 ? playerHand.map((c, i) => (
              <PlayingCard key={`p-${i}`} card={c} delay={(i + 2) * 200} dealFrom={deckRef.current?.getBoundingClientRect()} />
            )) : <div style={{ width: 85, height: 118, border: "2px dashed rgba(255,255,255,0.05)", borderRadius: 8 }} />}
          </div>
        </div>
      </div>

      {/* ── BET PANEL ── */}
      <div style={{
        width: 280, flexShrink: 0, background: "rgba(8,12,26,0.9)", borderRadius: 16, padding: 16,
        border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: 12,
        position: "sticky", top: 80
      }}>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", textAlign: "center" }}>Blackjack Bet</div>
        
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>$</span>
            <input type="text" value={amountStr} onChange={e => handleAmountChange(e.target.value)} disabled={isActive}
              style={{
                width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
                padding: "10px 10px 10px 25px", color: "#fff", fontWeight: 700, fontFamily: "monospace", outline: "none"
              }} />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setAmount(Math.max(minBet, amount / 2))} disabled={isActive} style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: 6, color: "#fff", fontSize: 10, fontWeight: 700 }}>1/2</button>
            <button onClick={() => setAmount(Math.min(maxBet, amount * 2))} disabled={isActive} style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: 6, color: "#fff", fontSize: 10, fontWeight: 700 }}>2x</button>
            <button onClick={() => setAmount(maxBet)} disabled={isActive} style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: 6, color: "#fff", fontSize: 10, fontWeight: 700 }}>MAX</button>
          </div>
        </div>

        {status === "idle" || isDone ? (
          <button onClick={isDone ? reset : deal} disabled={loading} style={{
            width: "100%", background: accent, color: "#000", border: "none", borderRadius: 10, padding: 14,
            fontWeight: 900, fontSize: 14, letterSpacing: 1, cursor: "pointer", boxShadow: `0 4px 15px ${accent}44`
          }}>
            {isDone ? "NEW GAME" : loading ? "DEALING..." : "PLACE BET"}
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => doAction("hit")} disabled={loading} className="bj-action-btn" style={{ flex: 1, background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, padding: 12, fontWeight: 900 }}>HIT</button>
              <button onClick={() => doAction("stand")} disabled={loading} className="bj-action-btn" style={{ flex: 1, background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, padding: 12, fontWeight: 900 }}>STAND</button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => doAction("double")} disabled={loading || playerHand.length !== 2} className="bj-action-btn" style={{ flex: 1, background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: 10, fontWeight: 800, fontSize: 11 }}>DOUBLE</button>
              {insuranceEligible && <button onClick={() => doAction("insurance")} disabled={loading} className="bj-action-btn" style={{ flex: 1, background: "#d97706", color: "#fff", border: "none", borderRadius: 8, padding: 10, fontWeight: 800, fontSize: 11 }}>INSURE</button>}
            </div>
          </div>
        )}

        <div style={{ marginTop: "auto", padding: 10, background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
            <span>Min Bet</span>
            <span>{formatCurrency(minBet)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            <span>Max Bet</span>
            <span>{formatCurrency(maxBet)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
