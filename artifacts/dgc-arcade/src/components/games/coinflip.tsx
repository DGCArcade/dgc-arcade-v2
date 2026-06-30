import { useState, useEffect, useRef } from "react";
import { Game } from "@workspace/api-client-react";
import { usePlaceBet, getGetMeQueryKey, getListRecentBetsAllQueryKey, getListBetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { THEMES, getTheme, type ThemeId } from "@/lib/theme";

// ─── Theme hook ──────────────────────────────────────────────────────────────

function useAccent() {
  const [id, setId] = useState<ThemeId>(getTheme());
  useEffect(() => {
    const h = (e: Event) => setId((e as CustomEvent<ThemeId>).detail);
    window.addEventListener("dgc-theme-change", h);
    return () => window.removeEventListener("dgc-theme-change", h);
  }, []);
  return THEMES.find(t => t.id === id)?.accent ?? "#FFD700";
}

// ─── Coin component ──────────────────────────────────────────────────────────

function DGCCoin({
  accent,
  isFlipping,
  result,
  size = 220,
}: {
  accent: string;
  isFlipping: boolean;
  result: "heads" | "tails" | null;
  size?: number;
}) {
  const spinRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!spinRef.current) return;
    if (isFlipping) {
      spinRef.current.style.animation = "none";
      void spinRef.current.offsetWidth;
      spinRef.current.style.animation = "dgc-coin-spin-heads 3s linear infinite";
    } else if (result) {
      spinRef.current.style.animation = "none";
      void spinRef.current.offsetWidth;
      const animName = result === "heads" ? "dgc-coin-spin-heads" : "dgc-coin-spin-tails";
      spinRef.current.style.animation = `${animName} 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`;
    } else {
      spinRef.current.style.animation = "none";
      spinRef.current.style.transform = "rotateY(0deg)";
    }
  }, [isFlipping, result]);

  return (
    <div style={{ position: "relative", width: size, height: size, perspective: "1200px", margin: "0 auto" }}>
      {/* Glow ring behind coin */}
      <div style={{
        position: "absolute",
        inset: -18,
        borderRadius: "50%",
        background: `radial-gradient(ellipse at 50% 50%, ${accent}22 0%, transparent 70%)`,
        filter: "blur(12px)",
        pointerEvents: "none",
      }} />

      {/* Coin shadow */}
      <div style={{
        position: "absolute", bottom: -14, left: "50%", transform: "translateX(-50%)",
        width: size * 0.82, height: 20, borderRadius: "50%",
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
          boxShadow: `0 0 60px ${accent}55, inset 0 4px 12px rgba(255,255,255,0.35), inset 0 -4px 12px rgba(0,0,0,0.25)`,
        }}>
          <div style={{ position: "absolute", inset: 10, borderRadius: "50%", border: `2px solid ${accent}55` }} />
          <div style={{ position: "absolute", inset: 16, borderRadius: "50%", border: `1px solid ${accent}33` }} />
          <div style={{ fontSize: Math.round(size * 0.236), fontWeight: 900, color: "rgba(0,0,0,0.75)", letterSpacing: 2, fontFamily: "'Outfit', sans-serif", lineHeight: 1, textShadow: "0 2px 4px rgba(0,0,0,0.3), 0 -1px 0 rgba(255,255,255,0.4)" }}>
            DGC
          </div>
          <div style={{ fontSize: Math.round(size * 0.05), fontWeight: 800, color: "rgba(0,0,0,0.55)", letterSpacing: 3, textTransform: "uppercase", marginTop: 4 }}>
            ARCADE
          </div>
          <div style={{ position: "absolute", bottom: Math.round(size * 0.1), fontSize: Math.round(size * 0.04), fontWeight: 700, color: "rgba(0,0,0,0.40)", letterSpacing: 2.5, textTransform: "uppercase" }}>
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
          <div style={{ fontSize: Math.round(size * 0.255), color: "rgba(255,255,255,0.88)", lineHeight: 1, textShadow: "0 2px 8px rgba(0,0,0,0.6), 0 -1px 0 rgba(255,255,255,0.15)" }}>
            ♠
          </div>
          <div style={{ fontSize: Math.round(size * 0.05), fontWeight: 800, color: "rgba(255,255,255,0.50)", letterSpacing: 3, textTransform: "uppercase", marginTop: 4 }}>
            ARCADE
          </div>
          <div style={{ position: "absolute", bottom: Math.round(size * 0.1), fontSize: Math.round(size * 0.04), fontWeight: 700, color: "rgba(255,255,255,0.32)", letterSpacing: 2.5, textTransform: "uppercase" }}>
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
  const [betId, setBetId] = useState<number | null>(null);
  const [serverSeedHash, setServerSeedHash] = useState<string | null>(null);
  const [clientSeed, setClientSeed] = useState<string | null>(null);
  const [nonce, setNonce] = useState<number | null>(null);
  const [showPF, setShowPF] = useState(false);

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
            setIsFlipping(false);
            const serverResult = data.won ? (choice as "heads" | "tails") : (choice === "heads" ? "tails" : "heads");
            setResult(serverResult);

            setBetId(data.bet.id);
            setServerSeedHash(data.bet.serverSeedHash ?? null);
            setClientSeed(data.bet.clientSeed ?? null);
            setNonce(data.bet.nonce ?? null);

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

  // Win/lose glow on the coin area
  const coinAreaGlow = win === true
    ? `0 0 0 2px rgba(34,197,94,0.35), 0 0 80px rgba(34,197,94,0.18)`
    : win === false
    ? `0 0 0 2px rgba(239,68,68,0.30), 0 0 60px rgba(239,68,68,0.14)`
    : "none";

  return (
    <div className="cf-root" style={{ display: "flex", flexDirection: "row", gap: 12, width: "100%", padding: "12px", alignItems: "flex-start", boxSizing: "border-box" }}>

      <style>{`
        /* ── Responsive layout ── */
        @media (max-width: 1024px) {
          .cf-root { flex-direction: column !important; padding: 6px !important; gap: 8px !important; }
          .cf-coin-area { order: 1 !important; width: 100% !important; min-height: 160px !important; padding: 12px 10px !important; }
          .cf-bet-panel { order: 2 !important; width: 100% !important; position: static !important; }
          .cf-coin-wrap { transform: scale(0.72); transform-origin: center center; }
          /* Stats row visible below coin on mobile */
          .cf-stats-mobile { display: flex !important; }
          /* Stats row in bet panel hidden on mobile (avoid duplication) */
          .cf-stats-panel { display: none !important; }
        }
        @media (min-width: 1025px) {
          .cf-stats-mobile { display: none !important; }
          .cf-stats-panel  { display: flex !important; }
        }

        /* ── Coin spin animations ── */
        @keyframes dgc-coin-spin-heads {
          0%   { transform: rotateY(0deg); }
          100% { transform: rotateY(1800deg); }
        }
        @keyframes dgc-coin-spin-tails {
          0%   { transform: rotateY(0deg); }
          100% { transform: rotateY(1980deg); }
        }

        /* ── Result pop ── */
        @keyframes cf-result-pop {
          0%   { transform: scale(0.5) translateY(-20px); opacity: 0; }
          65%  { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }

        /* ── Win / lose pulse on coin area ── */
        @keyframes cf-win-pulse {
          0%,100% { box-shadow: 0 0 0 2px rgba(34,197,94,0.30), 0 0 50px rgba(34,197,94,0.12); }
          50%      { box-shadow: 0 0 0 2px rgba(34,197,94,0.65), 0 0 90px rgba(34,197,94,0.30); }
        }
        @keyframes cf-lose-pulse {
          0%,100% { box-shadow: 0 0 0 2px rgba(239,68,68,0.25), 0 0 40px rgba(239,68,68,0.10); }
          50%      { box-shadow: 0 0 0 2px rgba(239,68,68,0.55), 0 0 70px rgba(239,68,68,0.22); }
        }

        /* ── Button hover states ── */
        .cf-choice-btn:hover:not(:disabled) { filter: brightness(1.12); transform: scale(1.02); }
        .cf-choice-btn:active:not(:disabled) { transform: scale(0.97); }
        .cf-mult:hover:not(:disabled) { background: rgba(255,255,255,0.12) !important; color: #fff !important; }
        .cf-flip-btn:hover:not(:disabled) { filter: brightness(1.12); transform: scale(1.02); }
        .cf-flip-btn:active:not(:disabled) { transform: scale(0.97); }
        .cf-pf-toggle:hover { opacity: 0.85; }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════════════
          COIN AREA  (left / full-width on mobile)
      ══════════════════════════════════════════════════════════════════════ */}
      <div
        className="cf-coin-area"
        style={{
          flex: 1, minWidth: 0,
          borderRadius: 20,
          background: "radial-gradient(ellipse at 50% 38%, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0) 70%)",
          border: "1.5px solid rgba(255,255,255,0.07)",
          backdropFilter: "blur(6px)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 20,
          padding: "40px 24px",
          position: "relative",
          overflow: "hidden",
          transition: "box-shadow 0.5s ease",
          boxShadow: coinAreaGlow,
          animation: win === true ? "cf-win-pulse 2.2s ease-in-out infinite" : win === false ? "cf-lose-pulse 2.2s ease-in-out infinite" : "none",
        }}
      >
        {/* Subtle star-field dots (decorative) */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          opacity: 0.4,
        }} />

        {/* Coin */}
        <div className="cf-coin-wrap" style={{ position: "relative", zIndex: 2 }}>
          <DGCCoin accent={accent} isFlipping={isFlipping} result={result} key={flipCount} size={220} />
        </div>

        {/* Result banner */}
        {win !== null && !isFlipping && (
          <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, animation: "cf-result-pop 0.6s cubic-bezier(0.34,1.56,0.64,1) both" }}>
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

        {/* Idle hint */}
        {win === null && !isFlipping && (
          <div style={{ position: "relative", zIndex: 5, fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.28)", letterSpacing: 2.5, textTransform: "uppercase" }}>
            Choose a side and flip!
          </div>
        )}

        {/* ── Game info text (always visible below coin) ── */}
        <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, marginTop: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3.5, color: "rgba(255,255,255,0.22)", textTransform: "uppercase" }}>COIN FLIP · 50/50 ODDS</span>
          <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 5, color: "rgba(255,255,255,0.18)", textTransform: "uppercase" }}>DGC ARCADE</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3.5, color: "rgba(255,255,255,0.22)", textTransform: "uppercase" }}>PAYS 2 TO 1</span>
        </div>

        {/* ── Stats row — shown BELOW coin on mobile only ── */}
        <div
          className="cf-stats-mobile"
          style={{
            position: "relative", zIndex: 5,
            width: "100%", maxWidth: 380,
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${accent}33`,
            borderRadius: 12,
            padding: "12px 16px",
            justifyContent: "space-around",
            textAlign: "center",
            fontSize: 9,
            fontFamily: "monospace",
            marginTop: 4,
          }}
        >
          {[
            { label: "Payout", value: "2.0×", color: accent },
            { label: "Odds", value: "50/50", color: accent },
            { label: "House Edge", value: "~1%", color: "rgba(255,255,255,0.45)" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
              <div style={{ color, fontWeight: 900, marginTop: 3, fontSize: 13 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          BET PANEL  (right / full-width on mobile)
      ══════════════════════════════════════════════════════════════════════ */}
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

        {/* Bet amount */}
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

        {/* Stats — desktop only (hidden on mobile, shown in coin area instead) */}
        <div
          className="cf-stats-panel"
          style={{
            background: "rgba(255,255,255,0.04)", border: `1px solid ${accent}33`,
            borderRadius: 10, padding: "10px",
            justifyContent: "space-around", textAlign: "center",
            fontSize: 9, fontFamily: "monospace",
          }}
        >
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

        {/* Potential win */}
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

        {/* ── Provably Fair section ── */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 10 }}>
          {/* Toggle header */}
          <button
            className="cf-pf-toggle"
            onClick={() => setShowPF(v => !v)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "none", border: "none", cursor: "pointer", padding: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* Shield icon */}
              <svg width="13" height="14" viewBox="0 0 13 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6.5 1L1 3.5V7C1 9.76 3.48 12.35 6.5 13C9.52 12.35 12 9.76 12 7V3.5L6.5 1Z" stroke={accent} strokeWidth="1.4" fill="none"/>
                <path d="M4 7l1.8 1.8L9 5" stroke={accent} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2.5, color: accent, textTransform: "uppercase" }}>
                Provably Fair
              </span>
            </div>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", transform: showPF ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▼</span>
          </button>

          {/* Expanded details */}
          {showPF && (
            <div style={{
              marginTop: 8, padding: 10,
              background: "rgba(0,0,0,0.55)",
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 8,
              fontSize: 8, color: "rgba(255,255,255,0.55)", fontFamily: "monospace",
              wordBreak: "break-all",
            }}>
              {serverSeedHash ? (
                <>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 2, letterSpacing: 1.5, textTransform: "uppercase" }}>Server Seed Hash (SHA-256)</span>
                    <span style={{ color: "rgba(255,255,255,0.80)", fontSize: 7.5 }}>{serverSeedHash}</span>
                  </div>
                  {clientSeed && (
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 2, letterSpacing: 1.5, textTransform: "uppercase" }}>Client Seed</span>
                      <span style={{ color: "rgba(255,255,255,0.80)" }}>{clientSeed}</span>
                    </div>
                  )}
                  {nonce !== null && (
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ color: "rgba(255,255,255,0.35)", display: "block", marginBottom: 2, letterSpacing: 1.5, textTransform: "uppercase" }}>Nonce</span>
                      <span style={{ color: "rgba(255,255,255,0.80)" }}>{nonce}</span>
                    </div>
                  )}
                  {betId !== null && (
                    <a
                      href={`/api/bets/verify/${betId}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "block", marginTop: 8, padding: "5px 8px",
                        background: `${accent}18`,
                        border: `1px solid ${accent}44`,
                        borderRadius: 5,
                        color: accent, textAlign: "center",
                        fontSize: 8, fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase",
                        textDecoration: "none",
                      }}
                    >
                      Verify Outcome →
                    </a>
                  )}
                </>
              ) : (
                <div style={{ color: "rgba(255,255,255,0.35)", textAlign: "center", padding: "6px 0", letterSpacing: 1.5, textTransform: "uppercase" }}>
                  Place a bet to see seed info
                </div>
              )}

              {/* How it works */}
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.07)", fontSize: 7, color: "rgba(255,255,255,0.30)", lineHeight: 1.6 }}>
                Before each flip the server generates a secret seed and commits its SHA-256 hash. After the flip the full seed is revealed so you can verify the result was not manipulated.
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
