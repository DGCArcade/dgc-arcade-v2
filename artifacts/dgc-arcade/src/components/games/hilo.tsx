import { useState, useEffect } from "react";
import { Game } from "@workspace/api-client-react";
import { usePlaceBet, getGetMeQueryKey, getListRecentBetsAllQueryKey, getListBetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatCurrency } from "@/lib/format";
import { THEMES, getTheme, type ThemeId } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronUp, ChevronDown, Equal } from "lucide-react";
import { ProvablyFairPanel } from "./provably-fair-panel";

interface HiLoProps { game: Game }

const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
function rankValue(rank: string) { return RANKS.indexOf(rank); }
const isRed = (suit: string) => suit === "♥" || suit === "♦";

function useAccent() {
  const [id, setId] = useState<ThemeId>(getTheme());
  useEffect(() => {
    const h = (e: Event) => setId((e as CustomEvent<ThemeId>).detail);
    window.addEventListener("dgc-theme-change", h);
    return () => window.removeEventListener("dgc-theme-change", h);
  }, []);
  return THEMES.find(t => t.id === id)?.accent ?? "#FFD700";
}

function CardFace({ rank, suit, animate, size = "normal" }: { rank: string; suit: string; animate?: boolean; size?: "normal" | "small" }) {
  const red = isRed(suit);
  const clr = red ? "#dc2626" : "#1a1a2e";
  const w = size === "small" ? 56 : 80;
  const h = size === "small" ? 78 : 112;
  return (
    <div className={animate ? "hilo-card-deal" : ""} style={{
      width: w, height: h, borderRadius: 10, background: "#fafafa",
      border: "1.5px solid #e0e0e0", padding: 6, display: "flex", flexDirection: "column",
      justifyContent: "space-between", boxShadow: "0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3)",
      flexShrink: 0,
    }}>
      <div>
        <div style={{ fontSize: size === "small" ? 13 : 16, fontWeight: 900, color: clr, lineHeight: 1 }}>{rank}</div>
        <div style={{ fontSize: size === "small" ? 11 : 13, color: clr, lineHeight: 1 }}>{suit}</div>
      </div>
      <div style={{ alignSelf: "center", fontSize: size === "small" ? 20 : 28, color: clr, opacity: 0.15 }}>{suit}</div>
      <div style={{ textAlign: "right", transform: "rotate(180deg)" }}>
        <div style={{ fontSize: size === "small" ? 13 : 16, fontWeight: 900, color: clr, lineHeight: 1 }}>{rank}</div>
        <div style={{ fontSize: size === "small" ? 11 : 13, color: clr, lineHeight: 1 }}>{suit}</div>
      </div>
    </div>
  );
}

function CardBack({ size = "normal" }: { size?: "normal" | "small" }) {
  const w = size === "small" ? 56 : 80;
  const h = size === "small" ? 78 : 112;
  return (
    <div style={{
      width: w, height: h, borderRadius: 10, overflow: "hidden",
      background: "linear-gradient(145deg, #1e3a8a 0%, #0c1445 100%)",
      border: "1.5px solid rgba(255,255,255,0.15)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      <div style={{ width: 16, height: 16, border: "1px solid rgba(255,255,255,0.2)", borderRadius: 2, transform: "rotate(45deg)" }} />
    </div>
  );
}

export function HiLo({ game }: HiLoProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const placeBet = usePlaceBet();
  const accent = useAccent();
  const isMobile = useIsMobile();

  const minBet = parseFloat(String(game.minBet ?? 0.01));
  const maxBet = parseFloat(String(game.maxBet ?? 1_000_000));

  const [amount, setAmount] = useState<number>(minBet);
  const [currentCard, setCurrentCard] = useState<{ rank: string; suit: string } | null>(null);
  const [nextCard, setNextCard] = useState<{ rank: string; suit: string } | null>(null);
  const [streak, setStreak] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [showResult, setShowResult] = useState(false);
  const [lastWon, setLastWon] = useState<boolean | null>(null);
  const [roundPayout, setRoundPayout] = useState(0);
  const [history, setHistory] = useState<{ won: boolean; rank: string; suit: string; mult: number }[]>([]);
  const [pf, setPf] = useState<{ betId?: number; serverSeedHash?: string; serverSeed?: string; clientSeed?: string; nonce?: number }>({});

  const deal = (pick: "hi" | "lo" | "equal") => {
    requireAuth(() => {
      if (!user || amount > user.balance) { toast({ title: "Insufficient balance", variant: "destructive" }); return; }
      setShowResult(false);

      placeBet.mutate({ data: { gameId: game.id, amount, meta: { pick, currentRank: currentCard?.rank ?? "7" } } }, {
        onSuccess: (data) => {
          const meta = data.bet.meta as Record<string, unknown>;
          const drawnRank = String(meta?.drawnRank ?? "7");
          const drawnSuit = String(meta?.suit ?? "♠");
          const next = { rank: drawnRank, suit: drawnSuit };
          setNextCard(next);
          setShowResult(true);
          setLastWon(data.won);
          setRoundPayout(data.payout);
          setPf({
            betId: data.bet.id,
            serverSeedHash: data.bet.serverSeedHash ?? undefined,
            serverSeed: data.bet.serverSeed ?? undefined,
            clientSeed: data.bet.clientSeed ?? undefined,
            nonce: data.bet.nonce ?? undefined,
          });
          qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
          qc.invalidateQueries({ queryKey: getListRecentBetsAllQueryKey() });
          qc.invalidateQueries({ queryKey: getListBetsQueryKey() });

          if (data.won) {
            const newStreak = streak + 1;
            const newMult = parseFloat((1 + newStreak * 0.5).toFixed(2));
            setStreak(newStreak);
            setMultiplier(newMult);
            setHistory(h => [{ won: true, rank: drawnRank, suit: drawnSuit, mult: newMult }, ...h].slice(0, 8));
            setCurrentCard(next);
            toast({ title: `Correct! +${formatCurrency(data.payout)}`, className: "bg-green-500 text-white" });
          } else {
            setHistory(h => [{ won: false, rank: drawnRank, suit: drawnSuit, mult: multiplier }, ...h].slice(0, 8));
            setStreak(0);
            setMultiplier(1);
            setTimeout(() => {
              setCurrentCard({ rank: "7", suit: "♠" });
              setNextCard(null);
              setShowResult(false);
              setLastWon(null);
            }, 1800);
          }
        },
        onError: (err) => toast({ title: "Bet Failed", description: err.data?.error, variant: "destructive" })
      });
    });
  };

  const startGame = () => {
    requireAuth(() => setCurrentCard({ rank: "7", suit: "♠" }));
  };

  const currentRankVal = currentCard ? rankValue(currentCard.rank) : 6;
  const hiOdds = currentCard ? Math.round(((12 - currentRankVal) / 13) * 100) : 50;
  const loOdds = currentCard ? Math.round((currentRankVal / 13) * 100) : 50;

  return (
    <div className={isMobile ? "hilo-root hilo-root--mobile flex flex-col" : "hilo-root flex flex-col md:flex-row gap-8"}>
      <style>{`
        @keyframes hilo-card-deal {
          0%   { transform: translateY(-30px) rotate(-5deg); opacity: 0; }
          60%  { transform: translateY(4px) rotate(1deg); opacity: 1; }
          100% { transform: translateY(0) rotate(0deg); opacity: 1; }
        }
        .hilo-card-deal { animation: hilo-card-deal 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        @media (max-width: 1024px) {
          .hilo-root:not(.hilo-root--mobile) { flex-direction: column !important; gap: 12px !important; }
        }
        .hilo-root--mobile {
          flex-direction: column !important;
          align-items: stretch !important;
          height: 100% !important;
          gap: 6px !important;
        }
        .hilo-root--mobile .hilo-card-area {
          flex: 1 1 auto !important;
          min-height: 0 !important;
          max-height: 50dvh !important;
          padding: 10px 8px !important;
        }
        .hilo-root--mobile .hilo-bet-panel {
          flex: 0 0 auto !important;
          width: 100% !important;
          padding: 8px !important;
          gap: 5px !important;
        }
        .hilo-root--mobile .hilo-bet-panel label { font-size: 9px !important; }
        .hilo-root--mobile .hilo-bet-panel input { font-size: 12px !important; height: 32px !important; }
        .hilo-root--mobile .hilo-pf-panel { display: none !important; }
        .hilo-action-btn { transition: all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .hilo-action-btn:hover:not(:disabled) { transform: translateY(-2px) scale(1.04); filter: brightness(1.1); }
        .hilo-action-btn:active:not(:disabled) { transform: scale(0.95); }
        .hilo-action-btn:disabled { opacity: 0.38 !important; cursor: not-allowed !important; }
      `}</style>

      {/* Card Area */}
      <div className="hilo-card-area flex-1 rounded-xl flex flex-col items-center justify-center gap-4 min-h-[220px] md:min-h-[440px]"
        style={{ background: "rgba(8,12,26,0.88)", border: "1.5px solid rgba(255,255,255,0.07)", padding: isMobile ? "10px 8px" : "32px 24px" }}>

        {/* History strip */}
        {history.length > 0 && (
          <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap", maxWidth: 340 }}>
            {history.map((h, i) => (
              <span key={i} style={{
                fontSize: 9, fontFamily: "monospace", fontWeight: 700,
                padding: "2px 6px", borderRadius: 8,
                background: h.won ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
                color: h.won ? "#22c55e" : "#ef4444",
                border: `1px solid ${h.won ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
              }}>
                {h.rank}{h.suit} {h.won ? `${h.mult}×` : "✗"}
              </span>
            ))}
          </div>
        )}

        {/* Cards Row */}
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 24 }}>
          {currentCard ? <CardFace {...currentCard} size={isMobile ? "small" : "normal"} /> : <CardBack size={isMobile ? "small" : "normal"} />}
          
          {/* Arrow indicator */}
          <div style={{
            width: isMobile ? 36 : 48, height: isMobile ? 36 : 48, borderRadius: "50%",
            background: showResult
              ? (lastWon ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)")
              : `${accent}22`,
            border: `2px solid ${showResult ? (lastWon ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)") : `${accent}55`}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.3s",
          }}>
            {!showResult
              ? <span style={{ color: accent, fontWeight: 900, fontSize: 18 }}>?</span>
              : lastWon
              ? <ChevronUp style={{ color: "#22c55e", width: 22, height: 22 }} />
              : <ChevronDown style={{ color: "#ef4444", width: 22, height: 22 }} />
            }
          </div>

          {showResult && nextCard
            ? <CardFace {...nextCard} animate size={isMobile ? "small" : "normal"} />
            : <CardBack size={isMobile ? "small" : "normal"} />
          }
        </div>

        {/* Streak display */}
        {streak > 0 && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 2 }}>Streak</div>
            <div style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 22, color: accent }}>
              {streak}🔥 · {multiplier}×
            </div>
          </div>
        )}

        {/* Result banner */}
        {showResult && lastWon !== null && (
          <div style={{
            fontSize: isMobile ? 18 : 24, fontWeight: 900, textTransform: "uppercase", letterSpacing: 2,
            color: lastWon ? "#22c55e" : "#ef4444",
            textShadow: `0 0 20px ${lastWon ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)"}`,
          }}>
            {lastWon ? `✓ Win! +${formatCurrency(roundPayout)}` : "✗ Wrong!"}
          </div>
        )}

        {/* Action Buttons */}
        {currentCard && !placeBet.isPending && (
          <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 6 : 10, width: "100%", maxWidth: 360 }}>
            <div style={{ display: "flex", gap: isMobile ? 6 : 10 }}>
              <button
                className="hilo-action-btn"
                onClick={() => deal("hi")}
                disabled={placeBet.isPending || currentRankVal >= 12}
                style={{
                  flex: 1, background: currentRankVal >= 12 ? "rgba(255,255,255,0.05)" : "linear-gradient(140deg, #16a34a, #15803d)",
                  color: "#fff", border: "none", borderRadius: 10,
                  padding: isMobile ? "10px 4px" : "14px 8px",
                  fontWeight: 900, fontSize: isMobile ? 13 : 15, cursor: currentRankVal >= 12 ? "not-allowed" : "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                }}>
                <ChevronUp style={{ width: 20, height: 20 }} />
                <span>HI</span>
                <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.7 }}>{hiOdds}%</span>
              </button>
              <button
                className="hilo-action-btn"
                onClick={() => deal("lo")}
                disabled={placeBet.isPending || currentRankVal <= 0}
                style={{
                  flex: 1, background: currentRankVal <= 0 ? "rgba(255,255,255,0.05)" : "linear-gradient(140deg, #dc2626, #b91c1c)",
                  color: "#fff", border: "none", borderRadius: 10,
                  padding: isMobile ? "10px 4px" : "14px 8px",
                  fontWeight: 900, fontSize: isMobile ? 13 : 15, cursor: currentRankVal <= 0 ? "not-allowed" : "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                }}>
                <ChevronDown style={{ width: 20, height: 20 }} />
                <span>LO</span>
                <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.7 }}>{loOdds}%</span>
              </button>
            </div>
            <button
              className="hilo-action-btn"
              onClick={() => deal("equal")}
              disabled={placeBet.isPending}
              style={{
                width: "100%", background: "linear-gradient(140deg, #7c3aed, #6d28d9)",
                color: "#fff", border: "none", borderRadius: 10,
                padding: isMobile ? "8px" : "10px",
                fontWeight: 900, fontSize: isMobile ? 12 : 13, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
              <Equal style={{ width: 16, height: 16 }} />
              EQUAL · 12× Payout
            </button>
          </div>
        )}

        {!currentCard && (
          <button
            onClick={startGame}
            style={{
              padding: "14px 40px", borderRadius: 10, fontWeight: 900, fontSize: 15, letterSpacing: 2,
              textTransform: "uppercase",
              background: `linear-gradient(140deg, ${accent}ee, ${accent}aa)`,
              color: "#000", border: "none", cursor: "pointer",
              boxShadow: `0 4px 20px ${accent}55`,
            }}>
            Deal Card
          </button>
        )}
      </div>

      {/* Bet Panel */}
      <div className="hilo-bet-panel w-full md:w-72 rounded-xl flex flex-col gap-5"
        style={{ background: "rgba(8,12,26,0.9)", border: "1.5px solid rgba(255,255,255,0.07)", padding: 20, backdropFilter: "blur(14px)", position: "sticky", top: 80 }}>

        {/* Panel title */}
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 8 }}>
          Hi-Lo
        </div>

        <div>
          <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Bet Per Round</Label>
          <div className="relative mt-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
            <Input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))}
              onBlur={() => setAmount(Math.max(minBet, Math.min(amount, maxBet)))}
              min={minBet} max={maxBet} step={0.01}
              className="pl-8 font-mono bg-secondary border-border" disabled={placeBet.isPending} />
          </div>
          <div className="flex gap-2 mt-2">
            {[
              { l: "MIN", fn: () => setAmount(minBet) },
              { l: "½",   fn: () => setAmount(Math.max(minBet, amount / 2)) },
              { l: "2×",  fn: () => setAmount(Math.min(amount * 2, maxBet)) },
              { l: "MAX", fn: () => setAmount(Math.min(user?.balance ?? 0, maxBet)) },
            ].map(({ l, fn }) => (
              <button key={l} onClick={fn} disabled={placeBet.isPending}
                style={{
                  flex: 1, padding: "6px 4px", borderRadius: 6, fontSize: 9, fontWeight: 700,
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)",
                  color: "rgba(255,255,255,0.6)", cursor: placeBet.isPending ? "not-allowed" : "pointer",
                  opacity: placeBet.isPending ? 0.38 : 1, transition: "all 0.14s",
                }}>{l}</button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${accent}33`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, fontSize: 10, fontFamily: "monospace" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "rgba(255,255,255,0.45)" }}>Streak</span>
            <span style={{ color: accent, fontWeight: 900 }}>{streak} 🔥</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "rgba(255,255,255,0.45)" }}>Multiplier</span>
            <span style={{ color: accent, fontWeight: 900 }}>{multiplier}×</span>
          </div>
          {user && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "rgba(255,255,255,0.45)" }}>Balance</span>
              <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 700 }}>{formatCurrency(user.balance)}</span>
            </div>
          )}
        </div>

        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textAlign: "center", lineHeight: 1.6 }}>
          Ace is high · 2 is low<br />
          Equal card pays 12×
        </div>

        <div className="hilo-pf-panel">
          <ProvablyFairPanel {...pf} />
        </div>
      </div>
    </div>
  );
}
