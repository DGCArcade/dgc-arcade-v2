import { useState, useEffect } from "react";
import { Game, getGetMeQueryKey } from "@workspace/api-client-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { THEMES, getTheme, type ThemeId } from "@/lib/theme";
import { ErrorBoundary } from "@/components/error-boundary";

function getToken() { return localStorage.getItem("dgc_token"); }
function authHeaders() { return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }; }

// ─── Sound effects ────────────────────────────────────────────────────────────
const playSound = (type: "click" | "gem" | "bomb" | "cashout") => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    switch (type) {
      case "click":  osc.frequency.value = 400; gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1); osc.start(now); osc.stop(now + 0.1); break;
      case "gem": {
        // High-pitched "ting" sound for diamonds
        osc.type = "sine";
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(2400, now + 0.05);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        
        // Add a second higher harmonic for extra sparkle
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(2400, now);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        gain2.gain.setValueAtTime(0.1, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc2.start(now);
        osc2.stop(now + 0.15);
        break;
      }
      case "bomb": {
        // Low frequency boom with noise for explosion
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.4);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
        
        // Create noise for the explosion "crunch"
        const bufferSize = ctx.sampleRate * 0.5;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseGain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(400, now);
        filter.frequency.exponentialRampToValueAtTime(20, now + 0.4);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noiseGain.gain.setValueAtTime(0.2, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        noise.start(now);
        noise.stop(now + 0.4);
        break;
      }
      case "cashout":osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(1000, now + 0.3); gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3); osc.start(now); osc.stop(now + 0.3); break;
    }
  } catch (e) {}
};

// ─── Theme hook ───────────────────────────────────────────────────────────────
function useAccent() {
  const [id, setId] = useState<ThemeId>(getTheme());
  useEffect(() => {
    const h = (e: Event) => setId((e as CustomEvent<ThemeId>).detail);
    window.addEventListener("dgc-theme-change", h);
    return () => window.removeEventListener("dgc-theme-change", h);
  }, []);
  return THEMES.find(t => t.id === id)?.accent ?? "#FFD700";
}

// ─── Grid configs: 24 (6×4), 48 (8×6), 60 (10×6) ───────────────────────────
const GRID_CONFIGS: Record<24 | 48 | 60, { cols: number; rows: number; label: string }> = {
  24: { cols: 6, rows: 4,  label: "4×6 · Starter" },
  48: { cols: 8, rows: 6,  label: "6×8 · Classic" },
  60: { cols: 10, rows: 6, label: "6×10 · Expert" },
};

interface MinesProps { game: Game }

export function Mines(props: MinesProps) {
  return (
    <ErrorBoundary>
      <MinesGame {...props} />
    </ErrorBoundary>
  );
}

function MinesGame({ game }: MinesProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const accent = useAccent();

  const minBet = parseFloat(String(game.minBet ?? 0.01));
  const maxBet = parseFloat(String(game.maxBet ?? 1_000_000));

  const [amount, setAmount] = useState<number>(minBet);
  const [amountStr, setAmountStr] = useState<string>(String(minBet));
  const [gridSize, setGridSize] = useState<24 | 48 | 60>(24);
  const [mineCount, setMineCount] = useState(5);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [minePositions, setMinePositions] = useState<number[]>([]);
  const [bustedAt, setBustedAt] = useState<number | null>(null);
  const [currentMultiplier, setCurrentMultiplier] = useState(1);
  const [nextMultiplier, setNextMultiplier] = useState(1);
  const [status, setStatus] = useState<"idle" | "active" | "busted" | "cashed_out">("idle");
  const [loading, setLoading] = useState(false);
  const [payout, setPayout] = useState(0);
  const [lastCell, setLastCell] = useState<number | null>(null);
  const [serverSeedHash, setServerSeedHash] = useState<string | null>(null);
  const [clientSeed, setClientSeed] = useState<string | null>(null);
  const [nonce, setNonce] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/mines/current", { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (mounted && d?.sessionId) {
          setSessionId(d.sessionId); 
          setRevealed(d.revealed || []);
          setCurrentMultiplier(d.currentMultiplier || 1); 
          setNextMultiplier(d.nextMultiplier || 1);
          setMineCount(d.mineCount || 5); 
          setAmount(d.bet || minBet); 
          setAmountStr(String(d.bet || minBet));
          setGridSize(d.gridSize || 24); 
          setServerSeedHash(d.serverSeedHash);
          setClientSeed(d.clientSeed);
          setNonce(d.nonce);
          setStatus("active");
        }
      }).catch(err => console.error("Mines session restore failed:", err));
    return () => { mounted = false; };
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

  const start = () => {
    requireAuth(async () => {
      if (!user || amount > parseFloat(String(user.balance))) {
        toast({ title: "Insufficient balance", variant: "destructive" }); return;
      }
      setLoading(true); playSound("click");
      try {
        const r = await fetch("/api/mines/start", {
          method: "POST", headers: authHeaders(),
          body: JSON.stringify({ gameId: game.id, amount, mineCount, gridSize }),
        });
        const d = await r.json();
        if (!r.ok) { toast({ title: d.error, variant: "destructive" }); return; }
        setSessionId(d.sessionId); setRevealed([]); setMinePositions([]);
        setBustedAt(null); setCurrentMultiplier(1); setNextMultiplier(d.nextMultiplier);
        setPayout(0); setLastCell(null);
        setServerSeedHash(d.serverSeedHash);
        setClientSeed(d.clientSeed);
        setNonce(d.nonce);
        
        // Small delay to ensure state updates don't collide with latency-heavy query invalidations
        setTimeout(() => {
          setStatus("active");
          qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
        }, 50);
      } finally { setLoading(false); }
    });
  };

  const reveal = async (cell: number) => {
    if (status !== "active" || revealed.includes(cell) || !sessionId) return;
    setLoading(true); setLastCell(cell); playSound("click");
    try {
      const r = await fetch("/api/mines/reveal", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ sessionId, cell }),
      });
      const d = await r.json();
      if (!r.ok) { toast({ title: d.error, variant: "destructive" }); return; }
      setRevealed(d.revealed);
      if (d.hit) {
        playSound("bomb"); setBustedAt(cell); setMinePositions(d.minePositions);
        setStatus("busted"); qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast({ title: "BOOM! 💣", description: "You hit a mine!", variant: "destructive" });
      } else {
        playSound("gem"); setCurrentMultiplier(d.currentMultiplier); setNextMultiplier(d.nextMultiplier);
      }
    } finally { setLoading(false); }
  };

  const cashout = async () => {
    if (!sessionId || status !== "active" || revealed.length === 0) return;
    setLoading(true); playSound("cashout");
    try {
      const r = await fetch("/api/mines/cashout", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ sessionId }),
      });
      const d = await r.json();
      if (!r.ok) { toast({ title: d.error, variant: "destructive" }); return; }
      setMinePositions(d.minePositions); setStatus("cashed_out"); setPayout(d.payout);
      qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: `Cashed out! +${formatCurrency(d.payout)}`, className: "bg-green-500 text-white" });
    } finally { setLoading(false); }
  };

  const reset = () => {
    setSessionId(null); setRevealed([]); setMinePositions([]); setBustedAt(null);
    setCurrentMultiplier(1); setNextMultiplier(1); setPayout(0); setStatus("idle"); setLastCell(null);
  };

  const isActive = status === "active";
  const isDone = status === "busted" || status === "cashed_out";
  const totalCells = gridSize;
  const safeCells = totalCells - mineCount;
  const cellsRemaining = safeCells - revealed.length;
  const cfg = GRID_CONFIGS[gridSize];

  // Responsive cell sizing
  const isMobile = useIsMobile();
  const cellSize = isMobile
    ? (gridSize === 24 ? 42 : gridSize === 48 ? 30 : 24)
    : (gridSize === 24 ? 60 : gridSize === 48 ? 46 : 38);
  const cellFontSize = isMobile
    ? (gridSize === 24 ? 18 : gridSize === 48 ? 13 : 10)
    : (gridSize === 24 ? 26 : gridSize === 48 ? 20 : 16);

  return (
    <div className="mines-game-root" style={{ display: "flex", flexDirection: "row", gap: 12, width: "100%", padding: "12px", alignItems: "flex-start", boxSizing: "border-box" }}>

      <style>{`
        @media (max-width: 1024px) {
          .mines-game-root { flex-direction: column-reverse !important; padding: 8px !important; gap: 16px !important; }
          .mines-bet-panel { width: 100% !important; position: static !important; order: 1; }
          .mines-grid-container { width: 100% !important; order: 2; min-height: auto !important; padding: 16px 10px !important; }
          .mines-cell { width: 100% !important; height: auto !important; aspect-ratio: 1/1 !important; }
        }
        @keyframes mines-reveal { 0% { transform: scale(0.7) rotateY(90deg); opacity: 0; } 100% { transform: scale(1) rotateY(0deg); opacity: 1; } }
        @keyframes mines-gem-pop { 0% { transform: scale(0.6); } 50% { transform: scale(1.18); } 100% { transform: scale(1); } }
        @keyframes mines-bomb-shake { 0%,100% { transform: translateX(0) scale(1); } 20% { transform: translateX(-4px) scale(1.05); } 40% { transform: translateX(4px) scale(1.05); } 60% { transform: translateX(-3px); } 80% { transform: translateX(3px); } }
        @keyframes mines-bust-flash { 0%,100% { background: rgba(239,68,68,0.15); } 50% { background: rgba(239,68,68,0.35); } }
        @keyframes mines-cashout-glow { 0%,100% { box-shadow: 0 0 0 2px rgba(34,197,94,0.3); } 50% { box-shadow: 0 0 0 3px rgba(34,197,94,0.7), 0 0 30px rgba(34,197,94,0.3); } }
        .mines-cell { transition: all 0.15s cubic-bezier(0.34,1.56,0.64,1) !important; }
        .mines-cell:hover:not(:disabled) { transform: scale(1.1) !important; z-index: 2; }
        .mines-cell:active:not(:disabled) { transform: scale(0.93) !important; }
        .mines-grid-bust { animation: mines-bust-flash 0.6s ease-in-out 3; }
        .mines-grid-cashout { animation: mines-cashout-glow 1.5s ease-in-out infinite; }
        .mines-size-btn:hover { filter: brightness(1.12); }
      `}</style>

      {/* ── GAME GRID ── */}
      <div className="mines-grid-container" style={{
        flex: 1, minWidth: 0,
        background: "rgba(8,12,26,0.88)",
        border: `2px solid ${isDone && status === "cashed_out" ? "rgba(34,197,94,0.3)" : isDone ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 16, padding: "20px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
        backdropFilter: "blur(14px)",
        transition: "border-color 0.3s ease",
        boxSizing: "border-box",
      }}>

        {/* Grid size selector (idle only) */}
        {status === "idle" && (
          <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
            {([24, 48, 60] as const).map(size => (
              <button key={size} onClick={() => setGridSize(size)} className="mines-size-btn"
                style={{
                  padding: "8px 16px", borderRadius: 9, fontSize: 11, fontWeight: 700, letterSpacing: 1,
                  textTransform: "uppercase",
                  background: gridSize === size ? `${accent}cc` : "rgba(255,255,255,0.06)",
                  border: `2px solid ${gridSize === size ? accent : "rgba(255,255,255,0.1)"}`,
                  color: gridSize === size ? "#000" : "rgba(255,255,255,0.6)",
                  cursor: "pointer", transition: "all 0.16s",
                  boxShadow: gridSize === size ? `0 0 14px ${accent}44` : "none",
                }}>
                <div style={{ fontWeight: 900 }}>{size} Boxes</div>
                <div style={{ fontSize: 8, fontWeight: 600, opacity: 0.7, marginTop: 1 }}>{GRID_CONFIGS[size].label}</div>
              </button>
            ))}
          </div>
        )}

        {/* Active grid info */}
        {(isActive || isDone) && (
          <div style={{ display: "flex", gap: 16, fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.40)", textTransform: "uppercase", letterSpacing: 1.5 }}>
            <span>{gridSize} cells · {mineCount} mines</span>
            {isActive && <span style={{ color: accent }}>Safe left: {cellsRemaining}</span>}
          </div>
        )}

        {/* Game Grid */}
        <div className={isDone && status === "busted" ? "mines-grid-bust" : isDone && status === "cashed_out" ? "mines-grid-cashout" : ""}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cfg.cols}, minmax(0, 1fr))`,
            gap: gridSize === 24 ? "7px" : gridSize === 48 ? "5px" : "4px",
            margin: "0 auto",
            width: "100%",
            maxWidth: isMobile ? "100%" : "none",
            boxSizing: "border-box",
          }}>
          {Array.from({ length: totalCells }, (_, i) => {
            const isRevealed = revealed.includes(i);
            const isMine = minePositions.includes(i);
            const isBustedCell = bustedAt === i;
            const isLastGem = lastCell === i && isRevealed && !isMine && isActive;
            const isGem = isRevealed && !isMine;

            let bg = "rgba(255,255,255,0.05)";
            let border = "rgba(255,255,255,0.1)";
            let boxShadow = "inset 0 1px 2px rgba(255,255,255,0.06)";
            let emoji = "";

            if (isBustedCell) {
              bg = "rgba(239,68,68,0.28)"; border = "#ef4444";
              boxShadow = "0 0 24px rgba(239,68,68,0.6)"; emoji = "💣";
            } else if (isMine && isDone) {
              bg = "rgba(239,68,68,0.12)"; border = "rgba(239,68,68,0.45)"; emoji = "💣";
            } else if (isGem) {
              bg = `${accent}18`; border = `${accent}88`;
              boxShadow = `0 0 14px ${accent}44`; emoji = "💎";
            } else if (isActive) {
              bg = "rgba(255,255,255,0.07)"; border = "rgba(255,255,255,0.14)"; emoji = "?";
            }

            return (
              <button key={i} onClick={() => reveal(i)}
                disabled={!isActive || isRevealed || loading}
                className="mines-cell"
                style={{
                  aspectRatio: "1/1", width: "100%", borderRadius: gridSize === 24 ? 10 : 8,
                  border: `2px solid ${border}`, background: bg, boxShadow,
                  fontSize: cellFontSize, fontWeight: 900, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: !isActive || isRevealed || loading ? "default" : "pointer",
                  opacity: !isActive && !isDone ? 0.4 : 1,
                  animation: isBustedCell ? "mines-bomb-shake 0.5s ease-in-out" :
                             isLastGem ? "mines-gem-pop 0.4s cubic-bezier(0.34,1.56,0.64,1)" :
                             isGem ? "mines-reveal 0.35s ease-out" : "none",
                  fontFamily: "monospace",
                }}>
                {emoji}
              </button>
            );
          })}
        </div>

        {/* Multiplier display during active play */}
        {isActive && revealed.length > 0 && (
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 36, fontWeight: 900, fontFamily: "monospace", color: accent, letterSpacing: 2, textShadow: `0 0 20px ${accent}66` }}>
              {currentMultiplier.toFixed(2)}×
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.40)", letterSpacing: 2, textTransform: "uppercase" }}>
              Next: {nextMultiplier.toFixed(2)}×
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", fontFamily: "monospace" }}>
              +{formatCurrency(amount * currentMultiplier - amount)} profit
            </div>
          </div>
        )}

        {/* Result banner */}
        {isDone && (
          <div style={{
            fontSize: 28, fontWeight: 900, textTransform: "uppercase", letterSpacing: 3,
            color: status === "cashed_out" ? "#22c55e" : "#ef4444",
            textShadow: status === "cashed_out" ? "0 0 20px rgba(34,197,94,0.6)" : "0 0 20px rgba(239,68,68,0.6)",
            fontFamily: "'Outfit', sans-serif",
          }}>
            {status === "cashed_out" ? `🎉 +${formatCurrency(payout)}` : "💣 BUSTED!"}
          </div>
        )}
      </div>

      {/* ── BET PANEL (right side) ── */}
      <div className="mines-bet-panel" style={{
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
          Mines Setup
        </div>

        {/* Bet amount */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>Bet Amount</label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.28)", fontFamily: "monospace", fontSize: 13, fontWeight: 700, pointerEvents: "none" }}>$</span>
            <input type="text" inputMode="decimal" value={amountStr}
              onChange={e => handleAmountChange(e.target.value)}
              onBlur={handleAmountBlur}
              disabled={isActive}
              style={{
                width: "100%", paddingLeft: 25, paddingRight: 10, paddingTop: 9, paddingBottom: 9,
                fontSize: 13, fontWeight: 700, fontFamily: "monospace",
                background: "rgba(255,255,255,0.05)",
                border: `1.5px solid ${isActive ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.11)"}`,
                borderRadius: 8, color: "#fff", outline: "none",
                opacity: isActive ? 0.55 : 1, boxSizing: "border-box",
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
              <button key={l} onClick={fn} disabled={isActive}
                style={{
                  flex: 1, padding: "8px 4px", borderRadius: 7, fontSize: 9, fontWeight: 700, letterSpacing: 1,
                  textTransform: "uppercase", background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.6)",
                  cursor: isActive ? "not-allowed" : "pointer", transition: "all 0.14s",
                  opacity: isActive ? 0.38 : 1,
                }}>{l}</button>
            ))}
          </div>
        </div>

        {/* Mine count slider */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>Mines</label>
            <span style={{ fontSize: 14, fontWeight: 900, color: accent, fontFamily: "monospace" }}>{mineCount}</span>
          </div>
          <input type="range" min={1} max={Math.floor(totalCells * 0.8)}
            value={mineCount} onChange={e => setMineCount(Number(e.target.value))}
            disabled={isActive}
            style={{ width: "100%", accentColor: accent, opacity: isActive ? 0.55 : 1 }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>
            <span>1 mine</span>
            <span style={{ color: "rgba(255,255,255,0.50)" }}>Safe: {safeCells}</span>
            <span>{Math.floor(totalCells * 0.8)} mines</span>
          </div>
          {/* Quick mine presets */}
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {[1, 3, 5, 10, 15].filter(v => v <= Math.floor(totalCells * 0.8)).map(v => (
              <button key={v} onClick={() => { if (!isActive) setMineCount(v); }}
                disabled={isActive}
                style={{
                  flex: 1, minWidth: 28, padding: "5px 4px", borderRadius: 6, fontSize: 9, fontWeight: 700,
                  border: `1px solid ${mineCount === v ? accent : "rgba(255,255,255,0.12)"}`,
                  color: mineCount === v ? accent : "rgba(255,255,255,0.40)",
                  background: mineCount === v ? `${accent}15` : "transparent",
                  cursor: isActive ? "not-allowed" : "pointer", transition: "all 0.14s",
                  opacity: isActive ? 0.38 : 1,
                }}>{v}</button>
            ))}
          </div>
        </div>

        {/* Stats panel */}
        <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${accent}33`, borderRadius: 10, padding: "10px", display: "flex", flexDirection: "column", gap: 6, fontSize: 10, fontFamily: "monospace" }}>
          {isActive ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(255,255,255,0.45)" }}>Multiplier</span>
                <span style={{ color: accent, fontWeight: 900 }}>{currentMultiplier.toFixed(2)}×</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(255,255,255,0.45)" }}>Profit</span>
                <span style={{ color: "#22c55e", fontWeight: 900 }}>+{formatCurrency(amount * currentMultiplier - amount)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(255,255,255,0.45)" }}>Safe left</span>
                <span style={{ color: "rgba(255,255,255,0.8)" }}>{cellsRemaining}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(255,255,255,0.45)" }}>Next mult</span>
                <span style={{ color: accent }}>{nextMultiplier.toFixed(2)}×</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(255,255,255,0.45)" }}>Grid</span>
                <span style={{ color: "rgba(255,255,255,0.7)" }}>{cfg.cols}×{cfg.rows}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(255,255,255,0.45)" }}>Safe cells</span>
                <span style={{ color: "rgba(255,255,255,0.7)" }}>{safeCells}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(255,255,255,0.45)" }}>Mine density</span>
                <span style={{ color: mineCount > totalCells * 0.5 ? "#ef4444" : mineCount > totalCells * 0.3 ? "#f59e0b" : "#22c55e" }}>
                  {Math.round((mineCount / totalCells) * 100)}%
                </span>
              </div>
            </>
          )}
        </div>

        {/* Action buttons */}
        {status === "idle" ? (
          <button onClick={start} disabled={loading}
            style={{
              padding: "14px 20px", borderRadius: 10, fontWeight: 900, fontSize: 13, letterSpacing: 3,
              textTransform: "uppercase",
              background: `linear-gradient(140deg, ${accent}ee, ${accent}aa)`,
              color: "#000", border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading ? "none" : `0 4px 20px ${accent}55`,
              opacity: loading ? 0.48 : 1, transition: "all 0.16s",
              fontFamily: "'Outfit', sans-serif",
            }}>
            {loading ? "Starting…" : "Place Bet"}
          </button>
        ) : isActive ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button onClick={cashout} disabled={loading || revealed.length === 0}
              style={{
                padding: "14px 20px", borderRadius: 10, fontWeight: 900, fontSize: 12, letterSpacing: 2,
                textTransform: "uppercase",
                background: "linear-gradient(140deg, #22c55e, #16a34a)",
                color: "#000", border: "none",
                cursor: loading || revealed.length === 0 ? "not-allowed" : "pointer",
                boxShadow: loading || revealed.length === 0 ? "none" : "0 4px 20px rgba(34,197,94,0.55)",
                opacity: loading || revealed.length === 0 ? 0.48 : 1, transition: "all 0.16s",
                fontFamily: "'Outfit', sans-serif",
              }}>
              {revealed.length > 0 ? `Cash Out ${currentMultiplier.toFixed(2)}×` : "Reveal a tile first"}
            </button>
            {revealed.length > 0 && (
              <div style={{ textAlign: "center", fontSize: 11, color: "#22c55e", fontFamily: "monospace", fontWeight: 700 }}>
                +{formatCurrency(amount * currentMultiplier - amount)} profit
              </div>
            )}
          </div>
        ) : isDone ? (
          <button onClick={reset}
            style={{
              padding: "14px 20px", borderRadius: 10, fontWeight: 900, fontSize: 13, letterSpacing: 3,
              textTransform: "uppercase",
              background: `linear-gradient(140deg, ${accent}ee, ${accent}aa)`,
              color: "#000", border: "none", cursor: "pointer",
              boxShadow: `0 4px 20px ${accent}55`, transition: "all 0.16s",
              fontFamily: "'Outfit', sans-serif",
            }}>
            New Game
          </button>
        ) : null}

        {/* Provably Fair Info */}
        {serverSeedHash && clientSeed !== null && nonce !== null && (
          <div style={{
            marginTop: 12, padding: 10, background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, fontSize: 8, color: "rgba(255,255,255,0.6)", fontFamily: "monospace", wordBreak: "break-all"
          }}>
            <div style={{ fontWeight: 900, color: "rgba(255,255,255,0.8)", marginBottom: 4 }}>PROVABLY FAIR</div>
            <div style={{ marginBottom: 2 }}>Server Hash: {serverSeedHash.slice(0, 16)}...</div>
            <div style={{ marginBottom: 2 }}>Client Seed: {clientSeed}</div>
            <div>Nonce: {nonce}</div>
            <div style={{ marginTop: 6, fontSize: 7, color: "rgba(255,255,255,0.4)" }}>
              After game completes, verify at:
              <a 
                href={`/api/mines/verify/${sessionId}`} 
                target="_blank" 
                rel="noreferrer"
                style={{ color: accent, marginLeft: 4, textDecoration: "underline" }}
              >
                /api/mines/verify/{sessionId}
              </a>
            </div>
            {isDone && (
              <button
                onClick={() => window.open(`/api/mines/verify/${sessionId}`, '_blank')}
                style={{
                  marginTop: 8, width: "100%", padding: "4px 8px", background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, color: "#fff",
                  fontSize: 8, fontWeight: 900, cursor: "pointer"
                }}
              >
                VERIFY OUTCOME
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
