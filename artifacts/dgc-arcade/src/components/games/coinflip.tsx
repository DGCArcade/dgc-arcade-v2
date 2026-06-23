import { useState, useEffect, useRef } from "react";
import { Game } from "@workspace/api-client-react";
import { usePlaceBet, getGetMeQueryKey, getListRecentBetsAllQueryKey, getListBetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { THEMES, getTheme, type ThemeId } from "@/lib/theme";

// ─── Theme hooks ────────────────────────────────────────────────────────────

function useAccent() {
  const [id, setId] = useState<ThemeId>(getTheme());
  useEffect(() => {
    const h = (e: Event) => setId((e as CustomEvent<ThemeId>).detail);
    window.addEventListener("dgc-theme-change", h);
    return () => window.removeEventListener("dgc-theme-change", h);
  }, []);
  return THEMES.find(t => t.id === id)?.accent ?? "#FFD700";
}

// Table felt colors that change with theme (like Blackjack)
const TABLE_MAP: Record<ThemeId, { bg: string; rim: string; glow: string; textColor: string }> = {
  dgc:        { bg: "radial-gradient(ellipse at 50% 40%, #1a2a0a 0%, #0d1a06 60%, #060e03 100%)", rim: "#2a4a0a", glow: "rgba(255,215,0,0.18)",   textColor: "rgba(255,215,0,0.22)" },
  cyber:      { bg: "radial-gradient(ellipse at 50% 40%, #001a0d 0%, #000f07 60%, #000804 100%)", rim: "#003d1a", glow: "rgba(0,255,65,0.15)",    textColor: "rgba(0,255,65,0.20)" },
  futuristic: { bg: "radial-gradient(ellipse at 50% 40%, #12062a 0%, #0a0318 60%, #060110 100%)", rim: "#2a0a5a", glow: "rgba(180,79,255,0.16)",  textColor: "rgba(180,79,255,0.22)" },
  blood:      { bg: "radial-gradient(ellipse at 50% 40%, #1a0505 0%, #0f0202 60%, #080101 100%)", rim: "#3d0a0a", glow: "rgba(255,30,30,0.15)",   textColor: "rgba(255,30,30,0.20)" },
  ocean:      { bg: "radial-gradient(ellipse at 50% 40%, #011a22 0%, #010f15 60%, #000a0f 100%)", rim: "#023a4a", glow: "rgba(0,210,220,0.15)",   textColor: "rgba(0,210,220,0.20)" },
  neon:       { bg: "radial-gradient(ellipse at 50% 40%, #1a0018 0%, #0f000f 60%, #080008 100%)", rim: "#3d0038", glow: "rgba(255,46,247,0.15)",  textColor: "rgba(255,46,247,0.20)" },
  volcanic:   { bg: "radial-gradient(ellipse at 50% 40%, #1a0800 0%, #0f0400 60%, #080200 100%)", rim: "#3d1200", glow: "rgba(255,85,0,0.15)",    textColor: "rgba(255,85,0,0.20)" },
  arctic:     { bg: "radial-gradient(ellipse at 50% 40%, #061520 0%, #030c15 60%, #020810 100%)", rim: "#0a2a40", glow: "rgba(168,223,255,0.15)", textColor: "rgba(168,223,255,0.20)" },
  midnight:   { bg: "radial-gradient(ellipse at 50% 40%, #0a0a0a 0%, #060606 60%, #030303 100%)", rim: "#1a1a1a", glow: "rgba(192,192,192,0.12)", textColor: "rgba(192,192,192,0.18)" },
};

function useTable() {
  const [id, setId] = useState<ThemeId>(getTheme());
  useEffect(() => {
    const h = (e: Event) => setId((e as CustomEvent<ThemeId>).detail);
    window.addEventListener("dgc-theme-change", h);
    return () => window.removeEventListener("dgc-theme-change", h);
  }, []);
  return TABLE_MAP[id] ?? TABLE_MAP.dgc;
}

// ─── Coin component ──────────────────────────────────────────────────────────

function DGCCoin({ accent, isFlipping, result }: { accent: string; isFlipping: boolean; result: "heads" | "tails" | null }) {
  const spinRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!spinRef.current) return;
    if (isFlipping) {
      // While flipping, we don't know the result yet, so we just spin fast
      spinRef.current.style.animation = "none";
      void spinRef.current.offsetWidth; // reflow
      spinRef.current.style.animation = "dgc-coin-spin-heads 3s linear infinite"; 
    } else if (result) {
      // When we get the result, we trigger the final landing animation
      spinRef.current.style.animation = "none";
      void spinRef.current.offsetWidth; // reflow
      const animName = result === "heads" ? "dgc-coin-spin-heads" : "dgc-coin-spin-tails";
      spinRef.current.style.animation = `${animName} 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`;
    } else {
      spinRef.current.style.animation = "none";
      spinRef.current.style.transform = "rotateY(0deg)";
    }
  }, [isFlipping, result]);

  return (
    <div style={{ position: "relative", width: 220, height: 220, perspective: "1200px", margin: "0 auto" }}>
      {/* Coin shadow on table */}
      <div style={{
        position: "absolute", bottom: -16, left: "50%", transform: "translateX(-50%)",
        width: 180, height: 24, borderRadius: "50%",
        background: "radial-gradient(ellipse, rgba(0,0,0,0.55) 0%, transparent 70%)",
        filter: "blur(6px)",
      }} />

      <div ref={spinRef} style={{
        width: "100%", height: "100%",
        position: "relative", transformStyle: "preserve-3d",
        transition: isFlipping ? "none" : "transform 0.6s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        {/* HEADS face */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: `conic-gradient(from 0deg, ${accent}ff 0%, ${accent}dd 25%, ${accent}ff 50%, ${accent}cc 75%, ${accent}ff 100%)`,
          border: `6px solid ${accent}99`,
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 50px ${accent}55, inset 0 4px 12px rgba(255,255,255,0.35), inset 0 -4px 12px rgba(0,0,0,0.25)`,
        }}>
          {/* Coin rim detail */}
          <div style={{ position: "absolute", inset: 10, borderRadius: "50%", border: `2px solid ${accent}55` }} />
          <div style={{ position: "absolute", inset: 16, borderRadius: "50%", border: `1px solid ${accent}33` }} />
          {/* DGC text */}
          <div style={{ fontSize: 52, fontWeight: 900, color: "rgba(0,0,0,0.75)", letterSpacing: 2, fontFamily: "'Outfit', sans-serif", lineHeight: 1, textShadow: `0 2px 4px rgba(0,0,0,0.3), 0 -1px 0 rgba(255,255,255,0.4)` }}>
            DGC
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(0,0,0,0.55)", letterSpacing: 3, textTransform: "uppercase", marginTop: 4 }}>
            ARCADE
          </div>
          <div style={{ position: "absolute", bottom: 22, fontSize: 9, fontWeight: 700, color: "rgba(0,0,0,0.40)", letterSpacing: 2.5, textTransform: "uppercase" }}>
            HEADS
          </div>
        </div>

        {/* TAILS face */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: "conic-gradient(from 0deg, #1e293b 0%, #0f172a 25%, #1e293b 50%, #0d1424 75%, #1e293b 100%)",
          border: "6px solid rgba(255,255,255,0.22)",
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
          transform: "rotateY(180deg)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 40px rgba(255,255,255,0.12), inset 0 4px 12px rgba(255,255,255,0.08), inset 0 -4px 12px rgba(0,0,0,0.5)",
        }}>
          <div style={{ position: "absolute", inset: 10, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.12)" }} />
          <div style={{ position: "absolute", inset: 16, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.06)" }} />
          {/* Spade symbol */}
          <div style={{ fontSize: 56, color: "rgba(255,255,255,0.88)", lineHeight: 1, textShadow: "0 2px 8px rgba(0,0,0,0.6), 0 -1px 0 rgba(255,255,255,0.15)" }}>
            ♠
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.50)", letterSpacing: 3, textTransform: "uppercase", marginTop: 4 }}>
            ARCADE
          </div>
          <div style={{ position: "absolute", bottom: 22, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.32)", letterSpacing: 2.5, textTransform: "uppercase" }}>
            TAILS
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface CoinflipProps { game: Game; }

export function Coinflip({ game }: CoinflipProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const placeBet = usePlaceBet();
  const accent = useAccent();
  const table = useTable();

  const minBet = parseFloat(String(game.minBet ?? 0.01));
  const maxBet = parseFloat(String(game.maxBet ?? 1_000_000));

  const [amount, setAmount] = useState<number>(minBet);
  const [amountStr, setAmountStr] = useState<string>(String(minBet));
  const [choice, setChoice] = useState<"heads" | "tails">("heads");
  const [isFlipping, setIsFlipping] = useState(false);
  const [result, setResult] = useState<"heads" | "tails" | null>(null);
  const [win, setWin] = useState<boolean | null>(null);
  const [payout, setPayout] = useState(0);
  const [flipCount, setFlipCount] = useState(0);

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

  const handleBet = () => {
    requireAuth(() => {
      if (amount < minBet || amount > maxBet) {
        toast({ title: "Invalid Bet", description: `Bet must be between ${formatCurrency(minBet)} and ${formatCurrency(maxBet)}`, variant: "destructive" });
        return;
      }
      if (user && amount > parseFloat(String(user.balance))) {
        toast({ title: "Insufficient funds", description: "You do not have enough balance.", variant: "destructive" });
        return;
      }

      setIsFlipping(true);
      setResult(null);
      setWin(null);
      setFlipCount(c => c + 1);

      placeBet.mutate(
        { data: { gameId: game.id, amount, meta: { choice } } },
        {
          onSuccess: (data) => {
            // Immediately stop the generic fast spin and trigger the landing animation
            setIsFlipping(false);
            const serverResult = data.won ? (choice as "heads" | "tails") : (choice === "heads" ? "tails" : "heads");
            setResult(serverResult);
            
            // Wait for the landing animation (1.2s) to finish before showing the win/loss banner
            setTimeout(() => {
              setWin(data.won);
              setPayout(data.payout);

              queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListRecentBetsAllQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListBetsQueryKey() });

              if (data.won) {
                toast({ title: "You Won! 🎉", description: `+${formatCurrency(data.payout)}`, className: "bg-green-500 text-white border-green-600" });
              }
            }, 1200);
          },
          onError: (err: any) => {
            setIsFlipping(false);
            toast({ title: "Bet Failed", description: err.data?.error || "An error occurred", variant: "destructive" });
          }
        }
      );
    });
  };

  const tableGlow = win === true
    ? `0 0 0 3px rgba(34,197,94,0.40), 0 0 80px rgba(34,197,94,0.20), 0 20px 50px rgba(0,0,0,0.75)`
    : win === false
    ? `0 0 0 3px rgba(239,68,68,0.35), 0 0 60px rgba(239,68,68,0.15), 0 20px 50px rgba(0,0,0,0.75)`
    : `0 0 0 2px rgba(255,255,255,0.06), 0 20px 50px rgba(0,0,0,0.70)`;

  return (
    <div className="cf-game-root" style={{ display: "flex", flexDirection: "row", gap: 12, width: "100%", padding: "12px", alignItems: "flex-start", boxSizing: "border-box" }}>

      <style>{`
        @media (max-width: 1024px) {
          .cf-game-root { flex-direction: column-reverse !important; padding: 8px !important; gap: 12px !important; }
          .cf-table-area { min-height: 320px !important; padding-top: 24px !important; padding-bottom: 24px !important; order: 2; width: 100% !important; }
          .cf-bet-panel { width: 100% !important; position: static !important; order: 1; }
          .cf-coin-wrap { width: clamp(120px, 35vw, 200px) !important; height: clamp(120px, 35vw, 200px) !important; }
        }
        @keyframes dgc-coin-spin-heads {
          0%   { transform: rotateY(0deg); }
          100% { transform: rotateY(1800deg); } /* Lands on Heads (0/360/etc) */
        }
        @keyframes dgc-coin-spin-tails {
          0%   { transform: rotateY(0deg); }
          100% { transform: rotateY(1980deg); } /* Lands on Tails (180/540/etc) */
        }
        @keyframes cf-result-pop {
          0%   { transform: scale(0.5) translateY(-20px); opacity: 0; }
          65%  { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes cf-win-pulse {
          0%,100% { box-shadow: 0 0 0 3px rgba(34,197,94,0.35), 0 0 50px rgba(34,197,94,0.15); }
          50%      { box-shadow: 0 0 0 3px rgba(34,197,94,0.70), 0 0 80px rgba(34,197,94,0.35); }
        }
        @keyframes cf-lose-pulse {
          0%,100% { box-shadow: 0 0 0 3px rgba(239,68,68,0.30), 0 0 40px rgba(239,68,68,0.10); }
          50%      { box-shadow: 0 0 0 3px rgba(239,68,68,0.60), 0 0 60px rgba(239,68,68,0.25); }
        }
        .cf-choice-btn:hover:not(:disabled) { filter: brightness(1.12); transform: scale(1.02); }
        .cf-choice-btn:active:not(:disabled) { transform: scale(0.97); }
        .cf-mult:hover:not(:disabled) { background: rgba(255,255,255,0.12) !important; color: #fff !important; }
        .cf-flip-btn:hover:not(:disabled) { filter: brightness(1.12); transform: scale(1.02); }
        .cf-flip-btn:active:not(:disabled) { transform: scale(0.97); }
      `}</style>

      {/* ── TABLE ── */}
      <div className="cf-table-area" style={{
        flex: 1, minWidth: 0,
        position: "relative",
        borderRadius: "24px 24px 50% 50% / 24px 24px 38% 38%",
        overflow: "hidden",
        background: table.bg,
        boxShadow: tableGlow,
        transition: "box-shadow 0.5s ease, background 0.5s ease",
        minHeight: 480,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 20, paddingTop: 32, paddingBottom: 32,
        animation: win === true ? "cf-win-pulse 2.2s ease-in-out infinite" : win === false ? "cf-lose-pulse 2.2s ease-in-out infinite" : "none",
      }}>
        {/* Table rim */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 25, borderRadius: "24px 24px 50% 50% / 24px 24px 38% 38%", border: `3px solid ${table.rim}`, boxShadow: "inset 0 0 35px rgba(0,0,0,0.5)" }} />
        <div style={{ position: "absolute", inset: 5, pointerEvents: "none", zIndex: 24, borderRadius: "20px 20px 50% 50% / 20px 20px 38% 38%", border: `1.5px solid ${table.rim}66` }} />

        {/* Felt texture */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1, backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Ccircle cx='1' cy='1' r='0.4' fill='rgba(255,255,255,0.012)'/%3E%3C/svg%3E\")" }} />

        {/* Table text */}
        <div style={{ position: "absolute", bottom: "18%", left: "50%", transform: "translateX(-50%)", zIndex: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, pointerEvents: "none", whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3.5, color: table.textColor, textTransform: "uppercase" }}>COIN FLIP · 50/50 ODDS</span>
          <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 5, color: table.textColor, textTransform: "uppercase" }}>DGC ARCADE</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3.5, color: table.textColor, textTransform: "uppercase" }}>PAYS 2 TO 1</span>
        </div>

        {/* Coin */}
        <div style={{ position: "relative", zIndex: 10 }}>
          <DGCCoin accent={accent} isFlipping={isFlipping} result={result} key={flipCount} />
        </div>

        {/* Result banner */}
        {win !== null && !isFlipping && (
          <div style={{ position: "relative", zIndex: 15, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, animation: "cf-result-pop 0.6s cubic-bezier(0.34,1.56,0.64,1) both" }}>
            <div style={{
              fontSize: 30, fontWeight: 900, textTransform: "uppercase", letterSpacing: 4,
              color: win ? "#22c55e" : "#ef4444",
              textShadow: win ? "0 0 24px rgba(34,197,94,0.6)" : "0 0 24px rgba(239,68,68,0.6)",
              fontFamily: "'Outfit', sans-serif",
            }}>
              {win ? "🎉 YOU WIN!" : "💀 YOU LOST"}
            </div>
            {win && payout > 0 && (
              <div style={{ fontSize: 16, fontWeight: 700, color: "#22c55e", letterSpacing: 1.2, fontFamily: "monospace", textShadow: "0 0 12px rgba(34,197,94,0.6)" }}>
                +{formatCurrency(payout)}
              </div>
            )}
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.55)", letterSpacing: 2, textTransform: "uppercase" }}>
              {result === "heads" ? "⬆ HEADS" : "⬇ TAILS"}
            </div>
          </div>
        )}

        {/* Idle state hint */}
        {win === null && !isFlipping && (
          <div style={{ position: "relative", zIndex: 10, fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.25)", letterSpacing: 2, textTransform: "uppercase" }}>
            Choose a side and flip!
          </div>
        )}
      </div>

      {/* ── BET PANEL ── */}
      <div className="cf-bet-panel" style={{
        width: 280, flexShrink: 0,
        background: "rgba(8,12,26,0.88)",
        border: "1.5px solid rgba(255,255,255,0.07)",
        borderRadius: 14, padding: "14px",
        display: "flex", flexDirection: "column", gap: 12,
        backdropFilter: "blur(14px)",
        position: "sticky", top: 80,
      }}>

        {/* Panel title */}
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 8 }}>
          Place Your Bet
        </div>

        {/* Bet amount input */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>Bet Amount</label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.28)", fontFamily: "monospace", fontSize: 13, fontWeight: 700, pointerEvents: "none" }}>$</span>
            <input
              type="text" inputMode="decimal"
              value={amountStr}
              onChange={e => handleAmountChange(e.target.value)}
              onBlur={handleAmountBlur}
              disabled={isFlipping}
              style={{
                width: "100%", paddingLeft: 25, paddingRight: 10, paddingTop: 9, paddingBottom: 9,
                fontSize: 13, fontWeight: 700, fontFamily: "monospace",
                background: "rgba(255,255,255,0.05)",
                border: `1.5px solid ${isFlipping ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.11)"}`,
                borderRadius: 8, color: "#fff", outline: "none",
                opacity: isFlipping ? 0.55 : 1, boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {[
              { l: "MIN", fn: () => setAmt(minBet) },
              { l: "0.1", fn: () => setAmt(0.1) },
              { l: "½",   fn: () => setAmt(Math.max(minBet, Math.floor((amount / 2) * 100) / 100)) },
              { l: "2×",  fn: () => setAmt(Math.min(amount * 2, maxBet)) },
              { l: "MAX", fn: () => setAmt(Math.min(parseFloat(String(user?.balance ?? 0)), maxBet)) },
            ].map(({ l, fn }) => (
              <button key={l} onClick={fn} disabled={isFlipping} className="cf-mult"
                style={{
                  flex: 1, padding: "8px 6px", borderRadius: 7, fontSize: 9, fontWeight: 700, letterSpacing: 1.2,
                  textTransform: "uppercase", background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.6)",
                  cursor: isFlipping ? "not-allowed" : "pointer", transition: "all 0.14s",
                  opacity: isFlipping ? 0.38 : 1,
                }}>{l}</button>
            ))}
          </div>
        </div>

        {/* Side chooser */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>Choose Side</label>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { side: "heads" as const, label: "⬆ Heads", color: accent },
              { side: "tails" as const, label: "⬇ Tails", color: "#64748b" },
            ].map(({ side, label, color }) => (
              <button key={side} onClick={() => setChoice(side)} disabled={isFlipping} className="cf-choice-btn"
                style={{
                  flex: 1, padding: "11px 8px", borderRadius: 10, fontSize: 11, fontWeight: 900, letterSpacing: 1.5,
                  textTransform: "uppercase",
                  background: choice === side ? `${color}cc` : "rgba(255,255,255,0.06)",
                  border: `2px solid ${choice === side ? color : "rgba(255,255,255,0.1)"}`,
                  color: choice === side ? "#000" : "rgba(255,255,255,0.6)",
                  cursor: isFlipping ? "not-allowed" : "pointer", transition: "all 0.16s",
                  opacity: isFlipping ? 0.38 : 1,
                  boxShadow: choice === side ? `0 0 16px ${color}44` : "none",
                }}
              >{label}</button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{
          background: "rgba(255,255,255,0.04)", border: `1px solid ${accent}33`,
          borderRadius: 10, padding: "10px",
          display: "flex", justifyContent: "space-around", textAlign: "center",
          fontSize: 9, fontFamily: "monospace",
        }}>
          {[
            { label: "Payout", value: "2.0×", color: accent },
            { label: "Odds", value: "50/50", color: accent },
            { label: "House Edge", value: "~1%", color: "rgba(255,255,255,0.45)" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
              <div style={{ color, fontWeight: 900, marginTop: 3, fontSize: 11 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Potential payout preview */}
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 1.5, textTransform: "uppercase" }}>Potential Win</span>
          <span style={{ fontSize: 13, fontWeight: 900, color: "#22c55e", fontFamily: "monospace" }}>
            +{formatCurrency(amount * 2)}
          </span>
        </div>

        {/* Flip button */}
        <button
          onClick={handleBet}
          disabled={isFlipping || placeBet.isPending}
          className="cf-flip-btn"
          style={{
            padding: "14px 20px", borderRadius: 10, fontWeight: 900, fontSize: 13, letterSpacing: 3,
            textTransform: "uppercase",
            background: `linear-gradient(140deg, ${accent}ee, ${accent}aa)`,
            color: "#000", border: "none",
            cursor: isFlipping || placeBet.isPending ? "not-allowed" : "pointer",
            boxShadow: isFlipping || placeBet.isPending ? "none" : `0 4px 20px ${accent}55`,
            opacity: isFlipping || placeBet.isPending ? 0.48 : 1,
            transition: "all 0.16s", fontFamily: "'Outfit', sans-serif",
            marginTop: "auto",
          }}
        >
          {isFlipping ? "Flipping…" : "Flip Coin"}
        </button>
      </div>
    </div>
  );
}
