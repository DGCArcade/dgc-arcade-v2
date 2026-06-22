import { useState, useEffect } from "react";
import { Game, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { THEMES, getTheme, type ThemeId } from "@/lib/theme";

function getToken() { return localStorage.getItem("dgc_token"); }
function authHeaders() { return { "Content-Type":"application/json", Authorization:`Bearer ${getToken()}` }; }

// Sound effects (inline base64 or simple Web Audio API)
const playSound = (type: "click" | "gem" | "bomb" | "cashout") => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);

    switch (type) {
      case "click":
        osc.frequency.value = 400;
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      case "gem":
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      case "bomb":
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      case "cashout":
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(1000, now + 0.3);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
    }
  } catch (e) {}
};

function useAccent() {
  const [id, setId] = useState<ThemeId>(getTheme());
  useEffect(() => {
    const h = (e: Event) => setId((e as CustomEvent<ThemeId>).detail);
    window.addEventListener("dgc-theme-change", h);
    return () => window.removeEventListener("dgc-theme-change", h);
  }, []);
  return THEMES.find(t => t.id === id)?.accent ?? "#FFD700";
}

interface MinesProps { game: Game }

export function Mines({ game }: MinesProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const accent = useAccent();

  const [amount, setAmount] = useState<number>(parseFloat(String(game.minBet ?? 1)));
  const [gridSize, setGridSize] = useState<24 | 48 | 62>(24);
  const [mineCount, setMineCount] = useState(5);
  const [sessionId, setSessionId] = useState<number|null>(null);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [minePositions, setMinePositions] = useState<number[]>([]);
  const [bustedAt, setBustedAt] = useState<number|null>(null);
  const [currentMultiplier, setCurrentMultiplier] = useState(1);
  const [nextMultiplier, setNextMultiplier] = useState(1);
  const [status, setStatus] = useState<"idle"|"active"|"busted"|"cashed_out">("idle");
  const [loading, setLoading] = useState(false);
  const [payout, setPayout] = useState(0);
  const [lastCell, setLastCell] = useState<number|null>(null);

  useEffect(() => {
    fetch("/api/mines/current", { headers: authHeaders() })
      .then(r=>r.json())
      .then(d => {
        if (d && d.sessionId) {
          setSessionId(d.sessionId);
          setRevealed(d.revealed);
          setCurrentMultiplier(d.currentMultiplier);
          setNextMultiplier(d.nextMultiplier);
          setMineCount(d.mineCount);
          setAmount(d.bet);
          setGridSize(d.gridSize || 24);
          setStatus("active");
        }
      }).catch(()=>{});
  }, []);

  const start = () => {
    requireAuth(async () => {
      if (!user || amount > parseFloat(String(user.balance))) { 
        toast({ title:"Insufficient balance", variant:"destructive" }); 
        return; 
      }
      setLoading(true);
      playSound("click");
      try {
        const r = await fetch("/api/mines/start", { 
          method:"POST", 
          headers:authHeaders(), 
          body:JSON.stringify({gameId:game.id,amount,mineCount,gridSize}) 
        });
        const d = await r.json();
        if (!r.ok) { toast({ title:d.error, variant:"destructive" }); return; }
        setSessionId(d.sessionId);
        setRevealed([]);
        setMinePositions([]);
        setBustedAt(null);
        setCurrentMultiplier(1);
        setNextMultiplier(d.nextMultiplier);
        setPayout(0);
        setStatus("active");
        qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      } finally { setLoading(false); }
    });
  };

  const reveal = async (cell: number) => {
    if (status !== "active" || revealed.includes(cell) || !sessionId) return;
    setLoading(true);
    setLastCell(cell);
    playSound("click");
    try {
      const r = await fetch("/api/mines/reveal", { 
        method:"POST", 
        headers:authHeaders(), 
        body:JSON.stringify({sessionId,cell}) 
      });
      const d = await r.json();
      if (!r.ok) { toast({ title:d.error, variant:"destructive" }); return; }
      setRevealed(d.revealed);
      if (d.hit) {
        playSound("bomb");
        setBustedAt(cell);
        setMinePositions(d.minePositions);
        setStatus("busted");
        qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast({ title: "BOOM! 💣", description: "You hit a mine!", variant: "destructive" });
      } else {
        playSound("gem");
        setCurrentMultiplier(d.currentMultiplier);
        setNextMultiplier(d.nextMultiplier);
      }
    } finally { setLoading(false); }
  };

  const cashout = async () => {
    if (!sessionId || status !== "active" || revealed.length === 0) return;
    setLoading(true);
    playSound("cashout");
    try {
      const r = await fetch("/api/mines/cashout", { 
        method:"POST", 
        headers:authHeaders(), 
        body:JSON.stringify({sessionId}) 
      });
      const d = await r.json();
      if (!r.ok) { toast({ title:d.error, variant:"destructive" }); return; }
      setMinePositions(d.minePositions);
      setStatus("cashed_out");
      setPayout(d.payout);
      qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title:`Cashed out! +${formatCurrency(d.payout)}`,className:"bg-green-500 text-white" });
    } finally { setLoading(false); }
  };

  const reset = () => {
    setSessionId(null);setRevealed([]);setMinePositions([]);setBustedAt(null);
    setCurrentMultiplier(1);setNextMultiplier(1);setPayout(0);setStatus("idle");setLastCell(null);
  };

  const isActive = status === "active";
  const isDone = status === "busted" || status === "cashed_out";
  const totalCells = gridSize;
  const safeCells = totalCells - mineCount;
  const cellsRemaining = safeCells - revealed.length;

  const gridCols = gridSize === 24 ? 6 : gridSize === 48 ? 8 : 10;
  const cellSize = gridSize === 24 ? 56 : gridSize === 48 ? 40 : 32;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", padding: "12px" }}>

      <style>{`
        @keyframes mines-reveal { 0% { transform: scale(0.8) rotateY(90deg); opacity: 0; } 100% { transform: scale(1) rotateY(0deg); opacity: 1; } }
        @keyframes mines-gem-pop { 0% { transform: scale(0.6); } 50% { transform: scale(1.15); } 100% { transform: scale(1); } }
        @keyframes mines-bomb-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
        .mines-cell:hover:not(:disabled) { transform: scale(1.08); }
        .mines-cell:active:not(:disabled) { transform: scale(0.94); }
      `}</style>

      {/* GRID */}
      <div style={{
        background: "rgba(8,12,26,0.88)",
        border: "2px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        backdropFilter: "blur(14px)",
      }}>

        {/* Grid size selector */}
        {status === "idle" && (
          <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
            {[24, 48, 62].map(size => (
              <button
                key={size}
                onClick={() => setGridSize(size as 24 | 48 | 62)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  background: gridSize === size ? `${accent}cc` : "rgba(255,255,255,0.06)",
                  border: `2px solid ${gridSize === size ? accent : "rgba(255,255,255,0.1)"}`,
                  color: gridSize === size ? "#000" : "rgba(255,255,255,0.6)",
                  cursor: "pointer",
                  transition: "all 0.16s",
                }}
              >
                {size} Boxes
              </button>
            ))}
          </div>
        )}

        {/* Game Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          gap: gridSize === 24 ? 6 : gridSize === 48 ? 4 : 3,
          width: "100%",
          maxWidth: gridSize === 24 ? 400 : gridSize === 48 ? 400 : 400,
          margin: "0 auto",
        }}>
          {Array.from({length: totalCells}, (_, i) => {
            const isRevealed = revealed.includes(i);
            const isMine = minePositions.includes(i);
            const isBustedCell = bustedAt === i;
            const isLastGem = lastCell === i && isRevealed && !isMine && isActive;

            return (
              <button
                key={i}
                onClick={() => reveal(i)}
                disabled={!isActive || isRevealed || loading}
                className="mines-cell"
                style={{
                  width: cellSize,
                  height: cellSize,
                  borderRadius: 8,
                  border: isBustedCell ? `2px solid #ef4444` :
                          isMine && isDone ? `2px solid rgba(239,68,68,0.5)` :
                          isRevealed ? `2px solid ${accent}88` :
                          isActive ? `2px solid rgba(255,255,255,0.15)` :
                          `2px solid rgba(255,255,255,0.06)`,
                  background: isBustedCell ? "rgba(239,68,68,0.3)" :
                              isMine && isDone ? "rgba(239,68,68,0.15)" :
                              isRevealed ? `${accent}15` :
                              isActive ? "rgba(255,255,255,0.08)" :
                              "rgba(255,255,255,0.03)",
                  fontSize: cellSize > 40 ? 24 : cellSize > 30 ? 18 : 14,
                  fontWeight: 900,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: !isActive || isRevealed || loading ? "not-allowed" : "pointer",
                  transition: "all 0.16s",
                  opacity: !isActive && !isDone ? 0.5 : 1,
                  animation: isBustedCell ? "mines-bomb-shake 0.4s ease-in-out" :
                             isLastGem ? "mines-gem-pop 0.4s cubic-bezier(0.34,1.56,0.64,1)" :
                             isRevealed && !isMine ? "mines-reveal 0.4s ease-out" : "none",
                  boxShadow: isBustedCell ? `0 0 20px rgba(239,68,68,0.5)` :
                             isRevealed && !isMine ? `0 0 12px ${accent}44` :
                             isActive && !isRevealed ? `inset 0 1px 2px rgba(255,255,255,0.1)` : "none",
                }}
              >
                {isBustedCell ? "💣" : isMine && isDone ? "💣" : isRevealed ? "💎" : isActive ? "?" : ""}
              </button>
            );
          })}
        </div>

        {/* Multiplier display */}
        {isActive && revealed.length > 0 && (
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "monospace", color: accent, letterSpacing: 2 }}>
              {currentMultiplier.toFixed(2)}x
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.45)", letterSpacing: 1.5, textTransform: "uppercase" }}>
              Next: {nextMultiplier.toFixed(2)}x
            </div>
          </div>
        )}

        {/* Result */}
        {isDone && (
          <div style={{
            fontSize: 24,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: 3,
            color: status === "cashed_out" ? "#22c55e" : "#ef4444",
            textShadow: status === "cashed_out" ? "0 0 16px rgba(34,197,94,0.5)" : "0 0 16px rgba(239,68,68,0.5)",
          }}>
            {status === "cashed_out" ? `+${formatCurrency(payout)}` : "BUSTED!"}
          </div>
        )}
      </div>

      {/* CONTROLS */}
      <div style={{
        background: "rgba(8,12,26,0.88)",
        border: "2px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        backdropFilter: "blur(14px)",
      }}>

        {/* Bet amount */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>
            Bet Amount
          </label>
          <div style={{ position: "relative" }}>
            <span style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "rgba(255,255,255,0.28)",
              fontFamily: "monospace",
              fontSize: 13,
              fontWeight: 700,
              pointerEvents: "none",
            }}>$</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(parseFloat(e.target.value) || 0)}
              disabled={isActive}
              style={{
                width: "100%",
                paddingLeft: 25,
                paddingRight: 10,
                paddingTop: 9,
                paddingBottom: 9,
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "monospace",
                background: "rgba(255,255,255,0.05)",
                border: `1.5px solid ${isActive ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.11)"}`,
                borderRadius: 8,
                color: "#fff",
                outline: "none",
                opacity: isActive ? 0.55 : 1,
              }}
            />
          </div>
        </div>

        {/* Mine count */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>
            Mines: {mineCount}
          </label>
          <input
            type="range"
            min={1}
            max={Math.floor(totalCells * 0.8)}
            value={mineCount}
            onChange={e => setMineCount(Number(e.target.value))}
            disabled={isActive}
            style={{
              width: "100%",
              accentColor: accent,
              opacity: isActive ? 0.55 : 1,
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>
            <span>1 mine</span>
            <span>Safe: {safeCells}</span>
            <span>{Math.floor(totalCells * 0.8)} mines</span>
          </div>
        </div>

        {/* Stats */}
        {isActive && (
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${accent}33`,
            borderRadius: 10,
            padding: "10px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 10,
            fontFamily: "monospace",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "rgba(255,255,255,0.45)" }}>Current</span>
              <span style={{ color: accent, fontWeight: 900 }}>{currentMultiplier.toFixed(2)}x</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "rgba(255,255,255,0.45)" }}>Profit</span>
              <span style={{ color: "#22c55e", fontWeight: 900 }}>+{formatCurrency(amount * currentMultiplier - amount)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "rgba(255,255,255,0.45)" }}>Safe left</span>
              <span style={{ color: "rgba(255,255,255,0.8)" }}>{cellsRemaining}</span>
            </div>
          </div>
        )}

        {/* Buttons */}
        {status === "idle" ? (
          <button
            onClick={start}
            disabled={loading}
            style={{
              padding: "11px 20px",
              borderRadius: 10,
              fontWeight: 900,
              fontSize: 12,
              letterSpacing: 3,
              textTransform: "uppercase",
              background: `linear-gradient(140deg, ${accent}ee, ${accent}aa)`,
              color: "#000",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading ? "none" : `0 4px 16px ${accent}50`,
              opacity: loading ? 0.48 : 1,
              transition: "all 0.16s",
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            {loading ? "Starting…" : "Place Bet"}
          </button>
        ) : isActive ? (
          <button
            onClick={cashout}
            disabled={loading || revealed.length === 0}
            style={{
              padding: "11px 20px",
              borderRadius: 10,
              fontWeight: 900,
              fontSize: 12,
              letterSpacing: 3,
              textTransform: "uppercase",
              background: "linear-gradient(140deg, #22c55e, #16a34a)",
              color: "#000",
              border: "none",
              cursor: loading || revealed.length === 0 ? "not-allowed" : "pointer",
              boxShadow: loading || revealed.length === 0 ? "none" : "0 4px 16px rgba(34,197,94,0.5)",
              opacity: loading || revealed.length === 0 ? 0.48 : 1,
              transition: "all 0.16s",
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            Cash Out {revealed.length > 0 ? `(${currentMultiplier.toFixed(2)}x)` : ""}
          </button>
        ) : isDone ? (
          <button
            onClick={reset}
            style={{
              padding: "11px 20px",
              borderRadius: 10,
              fontWeight: 900,
              fontSize: 12,
              letterSpacing: 3,
              textTransform: "uppercase",
              background: `linear-gradient(140deg, ${accent}ee, ${accent}aa)`,
              color: "#000",
              border: "none",
              cursor: "pointer",
              boxShadow: `0 4px 16px ${accent}50`,
              transition: "all 0.16s",
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            New Game
          </button>
        ) : null}
      </div>
    </div>
  );
}
