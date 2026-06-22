import { useState, useEffect } from "react";
import { Game } from "@workspace/api-client-react";
import { usePlaceBet, getGetMeQueryKey, getListRecentBetsAllQueryKey, getListBetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { THEMES, getTheme, type ThemeId } from "@/lib/theme";

function useAccent() {
  const [id, setId] = useState<ThemeId>(getTheme());
  useEffect(() => {
    const h = (e: Event) => setId((e as CustomEvent<ThemeId>).detail);
    window.addEventListener("dgc-theme-change", h);
    return () => window.removeEventListener("dgc-theme-change", h);
  }, []);
  return THEMES.find(t => t.id === id)?.accent ?? "#FFD700";
}

interface CoinflipProps { game: Game; }

export function Coinflip({ game }: CoinflipProps) {
  const { user, requireAuth } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const placeBet = usePlaceBet();
  const accent = useAccent();

  const [amount, setAmount] = useState<number>(parseFloat(String(game.minBet ?? 1)));
  const [choice, setChoice] = useState<"heads" | "tails">("heads");
  const [isFlipping, setIsFlipping] = useState(false);
  const [result, setResult] = useState<"heads" | "tails" | null>(null);
  const [win, setWin] = useState<boolean | null>(null);
  const [rotation, setRotation] = useState(0);

  const handleBet = () => {
    requireAuth(() => {
      if (amount < parseFloat(String(game.minBet ?? 1)) || amount > parseFloat(String(game.maxBet ?? 1000000))) {
        toast({
          title: "Invalid Bet",
          description: `Bet must be between ${formatCurrency(game.minBet)} and ${formatCurrency(game.maxBet)}`,
          variant: "destructive",
        });
        return;
      }
      
      if (user && amount > parseFloat(String(user.balance))) {
        toast({
          title: "Insufficient funds",
          description: "You do not have enough balance to place this bet.",
          variant: "destructive",
        });
        return;
      }

      setIsFlipping(true);
      setResult(null);
      setWin(null);
      setRotation(0);

      placeBet.mutate(
        { 
          data: { 
            gameId: game.id, 
            amount, 
            meta: { choice } 
          } 
        },
        {
          onSuccess: (data) => {
            setTimeout(() => {
              setIsFlipping(false);
              const serverResult = data.won ? choice : (choice === "heads" ? "tails" : "heads");
              setResult(serverResult);
              setWin(data.won);
              setRotation(serverResult === "heads" ? 0 : 180);
              
              queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListRecentBetsAllQueryKey() });
              queryClient.invalidateQueries({ queryKey: getListBetsQueryKey() });
              
              if (data.won) {
                toast({
                  title: "You Won! 🎉",
                  description: `Payout: ${formatCurrency(data.payout)}`,
                  className: "bg-green-500 text-white border-green-600",
                });
              } else {
                toast({
                  title: "You Lost 💀",
                  description: `Better luck next time!`,
                  className: "bg-red-500 text-white border-red-600",
                });
              }
            }, 2000);
          },
          onError: (err: any) => {
            setIsFlipping(false);
            toast({
              title: "Bet Failed",
              description: err.data?.error || "An error occurred",
              variant: "destructive",
            });
          }
        }
      );
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", padding: "12px" }}>

      <style>{`
        @keyframes coin-flip { 
          0% { transform: rotateY(0deg) rotateX(0deg); }
          100% { transform: rotateY(3600deg) rotateX(180deg); }
        }
        @keyframes result-pop {
          0% { transform: scale(0.6) translateY(-20px); opacity: 0; }
          65% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* COIN DISPLAY */}
      <div style={{
        background: "rgba(8,12,26,0.88)",
        border: "2px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        minHeight: 420,
        backdropFilter: "blur(14px)",
        perspective: "1000px",
      }}>

        {/* The DGC Coin */}
        <div style={{
          position: "relative",
          width: 200,
          height: 200,
          perspective: "1000px",
        }}>
          <div
            style={{
              width: "100%",
              height: "100%",
              position: "relative",
              transformStyle: "preserve-3d",
              transform: isFlipping 
                ? "rotateY(3600deg) rotateX(180deg)" 
                : `rotateY(${rotation}deg)`,
              transition: isFlipping ? "none" : "transform 0.6s cubic-bezier(0.34,1.56,0.64,1)",
              animation: isFlipping ? "coin-flip 2s linear" : "none",
            }}
          >
            {/* HEADS - DGC Logo */}
            <div style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: `radial-gradient(circle at 35% 35%, ${accent}ff, ${accent}cc)`,
              border: `4px solid ${accent}88`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 0 40px ${accent}66, inset 0 2px 8px rgba(255,255,255,0.3)`,
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
            }}>
              <div style={{
                position: "absolute",
                inset: 8,
                borderRadius: "50%",
                border: `2px solid ${accent}44`,
              }} />
              <div style={{
                fontSize: 48,
                fontWeight: 900,
                color: "#000",
                letterSpacing: 3,
                textShadow: "0 2px 4px rgba(0,0,0,0.2)",
                fontFamily: "'Outfit', sans-serif",
              }}>
                DGC
              </div>
              <div style={{
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(0,0,0,0.6)",
                letterSpacing: 2,
                textTransform: "uppercase",
                marginTop: 4,
              }}>
                HEADS
              </div>
            </div>

            {/* TAILS - Arcade Logo */}
            <div style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: "radial-gradient(circle at 35% 35%, #1e293b, #0f172a)",
              border: "4px solid rgba(255,255,255,0.25)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 40px rgba(255,255,255,0.15), inset 0 2px 8px rgba(0,0,0,0.5)",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}>
              <div style={{
                position: "absolute",
                inset: 8,
                borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.1)",
              }} />
              <div style={{
                fontSize: 48,
                fontWeight: 900,
                color: "#fff",
                letterSpacing: 3,
                textShadow: "0 2px 4px rgba(0,0,0,0.5)",
                fontFamily: "'Outfit', sans-serif",
              }}>
                ♠
              </div>
              <div style={{
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(255,255,255,0.6)",
                letterSpacing: 2,
                textTransform: "uppercase",
                marginTop: 4,
              }}>
                TAILS
              </div>
            </div>
          </div>
        </div>

        {/* Result */}
        {win !== null && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            animation: "result-pop 0.6s cubic-bezier(0.34,1.56,0.64,1) both",
          }}>
            <div style={{
              fontSize: 28,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: 4,
              color: win ? "#22c55e" : "#ef4444",
              textShadow: win ? "0 0 20px rgba(34,197,94,0.5)" : "0 0 20px rgba(239,68,68,0.5)",
              fontFamily: "'Outfit', sans-serif",
            }}>
              {win ? "🎉 YOU WIN!" : "💀 YOU LOST"}
            </div>
            <div style={{
              fontSize: 14,
              fontWeight: 600,
              color: "rgba(255,255,255,0.6)",
              letterSpacing: 1,
            }}>
              {result === "heads" ? "HEADS" : "TAILS"}
            </div>
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
              disabled={isFlipping}
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
                border: `1.5px solid ${isFlipping ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.11)"}`,
                borderRadius: 8,
                color: "#fff",
                outline: "none",
                opacity: isFlipping ? 0.55 : 1,
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {[
              { l: "MIN", fn: () => setAmount(parseFloat(String(game.minBet ?? 1))) },
              { l: "½", fn: () => setAmount(Math.max(parseFloat(String(game.minBet ?? 1)), amount / 2)) },
              { l: "2×", fn: () => setAmount(Math.min(amount * 2, parseFloat(String(game.maxBet ?? 1000000)))) },
              { l: "MAX", fn: () => setAmount(Math.min(parseFloat(String(user?.balance ?? 0)), parseFloat(String(game.maxBet ?? 1000000)))) },
            ].map(({ l, fn }) => (
              <button
                key={l}
                onClick={fn}
                disabled={isFlipping}
                style={{
                  flex: 1,
                  minWidth: 60,
                  padding: "8px 10px",
                  borderRadius: 7,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  color: "rgba(255,255,255,0.6)",
                  cursor: isFlipping ? "not-allowed" : "pointer",
                  transition: "all 0.14s",
                  opacity: isFlipping ? 0.38 : 1,
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Choice */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>
            Choose Side
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { side: "heads" as const, label: "Heads", color: accent },
              { side: "tails" as const, label: "Tails", color: "#64748b" },
            ].map(({ side, label, color }) => (
              <button
                key={side}
                onClick={() => setChoice(side)}
                disabled={isFlipping}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  background: choice === side ? `${color}cc` : "rgba(255,255,255,0.06)",
                  border: `2px solid ${choice === side ? color : "rgba(255,255,255,0.1)"}`,
                  color: choice === side ? "#000" : "rgba(255,255,255,0.6)",
                  cursor: isFlipping ? "not-allowed" : "pointer",
                  transition: "all 0.16s",
                  opacity: isFlipping ? 0.38 : 1,
                  boxShadow: choice === side ? `0 0 16px ${color}44` : "none",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Odds info */}
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${accent}33`,
          borderRadius: 10,
          padding: "10px",
          fontSize: 9,
          fontFamily: "monospace",
          color: "rgba(255,255,255,0.35)",
          display: "flex",
          justifyContent: "space-around",
          textAlign: "center",
        }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.45)" }}>Win</div>
            <div style={{ color: accent, fontWeight: 900, marginTop: 2 }}>2.0x</div>
          </div>
          <div>
            <div style={{ color: "rgba(255,255,255,0.45)" }}>Odds</div>
            <div style={{ color: accent, fontWeight: 900, marginTop: 2 }}>50/50</div>
          </div>
          <div>
            <div style={{ color: "rgba(255,255,255,0.45)" }}>House Edge</div>
            <div style={{ color: accent, fontWeight: 900, marginTop: 2 }}>~1%</div>
          </div>
        </div>

        {/* Bet button */}
        <button
          onClick={handleBet}
          disabled={isFlipping}
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
            cursor: isFlipping ? "not-allowed" : "pointer",
            boxShadow: isFlipping ? "none" : `0 4px 16px ${accent}50`,
            opacity: isFlipping ? 0.48 : 1,
            transition: "all 0.16s",
            fontFamily: "'Outfit', sans-serif",
          }}
        >
          {isFlipping ? "Flipping…" : "Place Bet"}
        </button>
      </div>
    </div>
  );
}
