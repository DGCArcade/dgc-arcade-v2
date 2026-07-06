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
import { ProvablyFairPanel } from "./provably-fair-panel";

interface KenoProps { game: Game }

function useAccent() {
  const [id, setId] = useState<ThemeId>(getTheme());
  useEffect(() => {
    const h = (e: Event) => setId((e as CustomEvent<ThemeId>).detail);
    window.addEventListener("dgc-theme-change", h);
    return () => window.removeEventListener("dgc-theme-change", h);
  }, []);
  return THEMES.find(t => t.id === id)?.accent ?? "#FFD700";
}

// Matches server kenoTable in bets.ts (pre house-edge)
const PAYOUT_TABLE: Record<number, number[]> = {
  1:  [0, 3],
  2:  [0, 0, 6],
  3:  [0, 0, 2, 10],
  4:  [0, 0, 1, 4, 15],
  5:  [0, 0, 0, 2, 6, 25],
  6:  [0, 0, 0, 1, 3, 10, 50],
  7:  [0, 0, 0, 0, 2, 5, 20, 100],
  8:  [0, 0, 0, 0, 1, 3, 10, 40, 200],
  9:  [0, 0, 0, 0, 0, 2, 6, 20, 100, 500],
  10: [0, 0, 0, 0, 0, 1, 4, 12, 50, 200, 1000],
};

export function Keno({ game }: KenoProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const placeBet = usePlaceBet();
  const accent = useAccent();
  const isMobile = useIsMobile();

  const minBet = parseFloat(String(game.minBet ?? 0.01));
  const maxBet = parseFloat(String(game.maxBet ?? 1_000_000));

  const [amount, setAmount] = useState<number>(minBet);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [drawn, setDrawn] = useState<number[]>([]);
  const [matches, setMatches] = useState<number[]>([]);
  const [playing, setPlaying] = useState(false);
  const [payout, setPayout] = useState<number | null>(null);
  const [won, setWon] = useState<boolean | null>(null);
  const [matchCount, setMatchCount] = useState(0);
  const [pf, setPf] = useState<{ betId?: number; serverSeedHash?: string; serverSeed?: string; clientSeed?: string; nonce?: number }>({});

  const toggleNum = (n: number) => {
    if (playing) return;
    const s = new Set(selected);
    if (s.has(n)) s.delete(n);
    else if (s.size < 10) s.add(n);
    setSelected(s);
  };

  const clear = () => {
    if (!playing) { setSelected(new Set()); setDrawn([]); setMatches([]); setPayout(null); setWon(null); }
  };

  const autoSelect = () => {
    if (playing) return;
    const count = selected.size || 5;
    const nums = new Set<number>();
    while (nums.size < count) nums.add(Math.floor(Math.random() * 80) + 1);
    setSelected(nums);
  };

  const play = () => {
    requireAuth(() => {
      if (!user || amount > user.balance) { toast({ title: "Insufficient balance", variant: "destructive" }); return; }
      if (selected.size < 1) { toast({ title: "Pick at least 1 number", variant: "destructive" }); return; }
      setDrawn([]);
      setMatches([]);
      setPayout(null);
      setWon(null);
      setPlaying(true);

      placeBet.mutate({ data: { gameId: game.id, amount, meta: { picks: [...selected] } } }, {
        onSuccess: (data) => {
          const meta = data.bet.meta as Record<string, unknown>;
          const drawnNums = (meta?.drawn as number[]) ?? [];
          const matchNums = (meta?.matchedNumbers as number[]) ?? [];
          const count = Number(meta?.matchCount ?? matchNums.length);

          let i = 0;
          const interval = setInterval(() => {
            if (i >= drawnNums.length) {
              clearInterval(interval);
              setMatches(matchNums);
              setMatchCount(count);
              setPayout(data.payout);
              setWon(data.won);
              setPlaying(false);
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
              if (data.won) toast({ title: `${count} matches! +${formatCurrency(data.payout)}`, className: "bg-green-500 text-white" });
              return;
            }
            setDrawn(prev => [...prev, drawnNums[i]]);
            i++;
          }, 55);
        },
        onError: (err) => { setPlaying(false); toast({ title: "Bet Failed", description: err.data?.error, variant: "destructive" }); }
      });
    });
  };

  const selArr = [...selected];
  const payouts = PAYOUT_TABLE[selArr.length] ?? [];

  return (
    <div className={isMobile ? "keno-root keno-root--mobile flex flex-col" : "keno-root flex flex-col md:flex-row gap-8"}>
      <style>{`
        @media (max-width: 1024px) {
          .keno-root:not(.keno-root--mobile) { flex-direction: column !important; gap: 12px !important; }
        }
        .keno-root--mobile {
          flex-direction: column !important;
          align-items: stretch !important;
          height: 100% !important;
          gap: 5px !important;
        }
        .keno-root--mobile .keno-grid-area {
          flex: 1 1 auto !important;
          min-height: 0 !important;
          padding: 8px !important;
          gap: 6px !important;
        }
        .keno-root--mobile .keno-grid-area .keno-number-grid {
          gap: 4px !important;
        }
        .keno-root--mobile .keno-bet-panel {
          flex: 0 0 auto !important;
          width: 100% !important;
          padding: 8px !important;
          gap: 5px !important;
        }
        .keno-root--mobile .keno-bet-panel label { font-size: 9px !important; }
        .keno-root--mobile .keno-bet-panel input { font-size: 12px !important; height: 32px !important; }
        .keno-root--mobile .keno-play-btn { height: 40px !important; font-size: 12px !important; }
        .keno-root--mobile .keno-pf-panel { display: none !important; }
        .keno-root--mobile .keno-payout-table { display: none !important; }
        @keyframes keno-ball-pop {
          0%   { transform: scale(0.5); opacity: 0; }
          60%  { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
        .keno-ball-pop { animation: keno-ball-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
      `}</style>

      {/* Grid Area */}
      <div className="keno-grid-area flex-1 rounded-xl flex flex-col gap-3 min-h-[200px] md:min-h-[440px]"
        style={{ background: "rgba(8,12,26,0.88)", border: "1.5px solid rgba(255,255,255,0.07)", padding: isMobile ? 8 : 20 }}>

        {/* Number Grid */}
        <div className="keno-number-grid" style={{ display: "grid", gridTemplateColumns: "repeat(10, minmax(0, 1fr))", gap: isMobile ? 4 : 6 }}>
          {Array.from({ length: 80 }, (_, i) => {
            const n = i + 1;
            const isSel = selected.has(n);
            const isDrawn = drawn.includes(n);
            const isMatch = matches.includes(n);

            let bg = "rgba(255,255,255,0.05)";
            let border = "rgba(255,255,255,0.1)";
            let color = "rgba(255,255,255,0.45)";
            let scale = "1";
            let shadow = "none";

            if (isMatch) {
              bg = "rgba(34,197,94,0.8)";
              border = "#22c55e";
              color = "#fff";
              scale = "1.1";
              shadow = "0 0 10px rgba(34,197,94,0.6)";
            } else if (isDrawn && !isSel) {
              bg = "rgba(239,68,68,0.25)";
              border = "rgba(239,68,68,0.5)";
              color = "#fca5a5";
            } else if (isSel && isDrawn) {
              bg = `${accent}cc`;
              border = accent;
              color = "#000";
              scale = "1.1";
            } else if (isSel) {
              bg = `${accent}33`;
              border = accent;
              color = accent;
              scale = "1.05";
            }

            return (
              <button
                key={n}
                onClick={() => toggleNum(n)}
                disabled={playing && !isDrawn}
                className={isDrawn ? "keno-ball-pop" : ""}
                style={{
                  aspectRatio: "1", borderRadius: 6, fontSize: isMobile ? 9 : 11, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: bg, border: `1px solid ${border}`, color,
                  transform: `scale(${scale})`, boxShadow: shadow,
                  transition: "all 0.15s", cursor: playing && !isDrawn ? "not-allowed" : "pointer",
                  fontFamily: "monospace",
                }}>
                {n}
              </button>
            );
          })}
        </div>

        {/* Legend & Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 9, color: "rgba(255,255,255,0.45)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: `${accent}55`, border: `1px solid ${accent}`, display: "inline-block" }} />
              Selected ({selected.size}/10)
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(34,197,94,0.8)", display: "inline-block" }} />
              Match
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={autoSelect} disabled={playing}
              style={{ fontSize: 9, fontWeight: 700, color: accent, cursor: playing ? "not-allowed" : "pointer", opacity: playing ? 0.38 : 1, background: "none", border: "none" }}>
              Auto
            </button>
            <button onClick={clear} disabled={playing}
              style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", cursor: playing ? "not-allowed" : "pointer", opacity: playing ? 0.38 : 1, background: "none", border: "none" }}>
              Clear
            </button>
          </div>
        </div>

        {/* Result */}
        {payout !== null && won !== null && (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{
              fontSize: isMobile ? 18 : 24, fontWeight: 900, textTransform: "uppercase", letterSpacing: 2,
              color: won ? "#22c55e" : "rgba(255,255,255,0.5)",
              textShadow: won ? "0 0 20px rgba(34,197,94,0.5)" : "none",
            }}>
              {matchCount} match{matchCount !== 1 ? "es" : ""}!{" "}
              {won ? `+${formatCurrency(payout)}` : "Better luck next time"}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="keno-bet-panel w-full md:w-72 rounded-xl flex flex-col gap-5"
        style={{ background: "rgba(8,12,26,0.9)", border: "1.5px solid rgba(255,255,255,0.07)", padding: 20, backdropFilter: "blur(14px)" }}>

        {/* Panel title */}
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 8 }}>
          Keno
        </div>

        <div>
          <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Bet Amount</Label>
          <div className="relative mt-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
            <Input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))}
              onBlur={() => setAmount(Math.max(minBet, Math.min(amount, maxBet)))}
              min={minBet} max={maxBet} step={0.01}
              className="pl-8 font-mono bg-secondary border-border" disabled={playing} />
          </div>
          <div className="flex gap-2 mt-2">
            {[
              { l: "MIN", fn: () => setAmount(minBet) },
              { l: "½",   fn: () => setAmount(Math.max(minBet, amount / 2)) },
              { l: "2×",  fn: () => setAmount(Math.min(amount * 2, maxBet)) },
              { l: "MAX", fn: () => setAmount(Math.min(user?.balance ?? 0, maxBet)) },
            ].map(({ l, fn }) => (
              <button key={l} onClick={fn} disabled={playing}
                style={{
                  flex: 1, padding: "6px 4px", borderRadius: 6, fontSize: 9, fontWeight: 700,
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)",
                  color: "rgba(255,255,255,0.6)", cursor: playing ? "not-allowed" : "pointer",
                  opacity: playing ? 0.38 : 1, transition: "all 0.14s",
                }}>{l}</button>
            ))}
          </div>
        </div>

        {/* Payout table */}
        {selArr.length > 0 && (
          <div className="keno-payout-table space-y-1">
            <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">Payouts ({selArr.length} picks)</Label>
            <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${accent}33`, borderRadius: 10, padding: "8px 10px", maxHeight: 140, overflowY: "auto" }}>
              {payouts.map((mult, i) => mult > 0 ? (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "monospace", padding: "2px 0" }}>
                  <span style={{ color: "rgba(255,255,255,0.45)" }}>{i} match{i !== 1 ? "es" : ""}</span>
                  <span style={{ color: mult >= 10 ? accent : "rgba(255,255,255,0.8)", fontWeight: mult >= 10 ? 900 : 700 }}>{mult}×</span>
                </div>
              ) : null)}
            </div>
          </div>
        )}

        {user && (
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "monospace", textAlign: "center" }}>
            Balance: <span style={{ color: accent, fontWeight: 900 }}>{formatCurrency(user.balance)}</span>
          </div>
        )}

        <button
          className="keno-play-btn"
          onClick={play}
          disabled={playing || selected.size < 1 || placeBet.isPending}
          style={{
            width: "100%", padding: "14px 20px", borderRadius: 10, fontWeight: 900, fontSize: 14, letterSpacing: 2,
            textTransform: "uppercase",
            background: playing || selected.size < 1 ? "rgba(100,100,100,0.4)" : `linear-gradient(140deg, ${accent}ee, ${accent}aa)`,
            color: "#000", border: "none",
            cursor: playing || selected.size < 1 || placeBet.isPending ? "not-allowed" : "pointer",
            boxShadow: playing || selected.size < 1 ? "none" : `0 4px 20px ${accent}55`,
            opacity: playing || selected.size < 1 ? 0.55 : 1,
            transition: "all 0.16s", marginTop: "auto",
          }}>
          {playing ? "Drawing…" : selected.size < 1 ? "Pick Numbers" : "Play Keno"}
        </button>

        <div className="keno-pf-panel">
          <ProvablyFairPanel {...pf} />
        </div>
      </div>
    </div>
  );
}
