import { useState, useEffect, useCallback, useRef } from "react";
import { Game, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatCurrency } from "@/lib/format";
import { THEMES, getTheme, type ThemeId } from "@/lib/theme";
import { ProvablyFairPanel } from "./provably-fair-panel";

interface Card { suit: string; rank: string }
type Status = "idle" | "active" | "player_blackjack" | "player_wins" | "dealer_wins" | "push" | "player_bust" | "split_complete";

// Voice announcements disabled - using original sounds only
const VOICE_LINES = {
  split: [],
  hit: [],
  stand: [],
  win: [],
  lose: [],
  blackjack: [],
};

function getToken() { return localStorage.getItem("dgc_token"); }
function authHeaders() { return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }; }

function handTotal(hand: Card[], showHidden = false): number {
  let t = 0, a = 0;
  for (const c of hand) {
    if (c.suit === "?" && !showHidden) continue;
    const v = ["J","Q","K"].includes(c.rank) ? 10 : c.rank === "A" ? 11 : parseInt(c.rank);
    if (v === 11) a++;
    t += v;
  }
  while (t > 21 && a > 0) { t -= 10; a--; }
  return t;
}

function isSoftHand(hand: Card[], showHidden = false): boolean {
  let t = 0, a = 0;
  for (const c of hand) {
    if (c.suit === "?" && !showHidden) continue;
    const v = ["J","Q","K"].includes(c.rank) ? 10 : c.rank === "A" ? 11 : parseInt(c.rank);
    if (v === 11) a++;
    t += v;
  }
  return a > 0 && t <= 21;
}

function getSoftTotalString(hand: Card[], showHidden = false): string {
  const total = handTotal(hand, showHidden);
  if (total === 0) return "—";
  if (isSoftHand(hand, showHidden) && total < 21) {
    return `${total - 10}/${total}`;
  }
  return String(total);
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

// ─── Sound Engine ───────────────────────────────────────────────────────────
class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private buffers: Record<string, AudioBuffer> = {};

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return this.ctx;
  }

  private getMasterGain(): GainNode {
    if (!this.masterGain) {
      const ctx = this.getCtx();
      this.masterGain = ctx.createGain();
      this.masterGain.connect(ctx.destination);
      this.masterGain.gain.value = 0.3;
    }
    return this.masterGain;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(m ? 0 : 0.3, this.getCtx().currentTime, 0.1);
    }
  }

  private async loadSound(name: string, url: string) {
    if (this.buffers[name]) return;
    try {
      const r = await fetch(url);
      const b = await r.arrayBuffer();
      this.buffers[name] = await this.getCtx().decodeAudioData(b);
    } catch (e) {}
  }

  private playBuffer(name: string, volume = 0.5) {
    if (this.muted || !this.buffers[name]) return;
    const ctx = this.getCtx();
    const source = ctx.createBufferSource();
    source.buffer = this.buffers[name];
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.getMasterGain());
    source.start(0);
  }

  init() {
    this.loadSound("blackjack", "/audio/blackjack.wav");
    this.loadSound("win", "/audio/win.wav");
    this.loadSound("lose", "/audio/lose.wav");
  }

  cardDeal() {
    if (this.muted) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.connect(gain);
    gain.connect(this.getMasterGain());
    osc.start(now);
    osc.stop(now + 0.1);
  }

  blackjackCheer() {
    this.playBuffer("blackjack", 0.8);
    // Add synth celebration too
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(440 + i * 110, now + i * 0.1);
      gain.gain.setValueAtTime(0.1, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.4);
      osc.connect(gain);
      gain.connect(this.getMasterGain());
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.4);
    }
  }

  winFanfare() {
    this.playBuffer("win", 0.7);
    this.crowdCheer();
  }

  lossBuzz() {
    this.playBuffer("lose", 0.7);
    this.crowdSigh();
  }

  crowdCheer() {
    if (this.muted) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.8, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(1500, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.getMasterGain());
    source.start(now);
  }

  crowdSigh() {
    if (this.muted) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(600, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.getMasterGain());
    source.start(now);
  }

  splitChime() {
    if (this.muted) return;
    const ctx = this.getCtx();
    const now = ctx.currentTime;
    // Two-tone chime for split
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880 + i * 220, now + i * 0.15);
      gain.gain.setValueAtTime(0.12, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.25);
      osc.connect(gain);
      gain.connect(this.getMasterGain());
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.25);
    }
  }

  announceVoiceLine(category: keyof typeof VOICE_LINES) {
    // Voice lines disabled - using original sounds only
    return;
  }
}

const soundEngine = new SoundEngine();

// ─── Card Component with Flip Animation ───
function PlayingCard({ card, hidden, delay = 0, dealFrom, isMobile }: { 
  card: Card; hidden?: boolean; delay?: number; dealFrom?: { x: number; y: number }; isMobile?: boolean 
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
      soundEngine.cardDeal();
    }
  }, [dealFrom, delay, hasAnimated]);

  return (
    <div ref={cardRef} className="bj-card-container" style={{
      width: isMobile ? "clamp(55px, 15vw, 85px)" : 85, 
      height: isMobile ? "clamp(75px, 20vw, 118px)" : 118, 
      borderRadius: 8, position: "relative",
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
          boxShadow: "0 8px 24px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.1)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3
        }}>
          <div style={{ width: 22, height: 22, border: "1.5px solid rgba(255,255,255,0.16)", borderRadius: 3, transform: "rotate(45deg)" }} />
          <span style={{ fontSize: 6, fontWeight: 900, letterSpacing: 1.5, color: "rgba(255,255,255,0.25)" }}>DGC ARCADE</span>
        </div>
        
        {/* Card Front */}
        <div style={{
          position: "absolute", width: "100%", height: "100%", backfaceVisibility: "hidden",
          borderRadius: 8, background: "#fafafa", border: "1.5px solid #e0e0e0",
          transform: "rotateY(180deg)", boxShadow: "0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3)",
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

function ScoreBubble({ total, displayTotal, bust, bj, label }: { total: number; displayTotal?: string; bust?: boolean; bj?: boolean; label: string }) {
  const bg = bust ? "rgba(239,68,68,0.4)" : bj ? "rgba(251,191,36,0.4)" : "rgba(0,0,0,0.8)";
  const border = bust ? "rgba(239,68,68,0.7)" : bj ? "rgba(251,191,36,0.7)" : "rgba(255,255,255,0.3)";
  const color = bust ? "#fca5a5" : bj ? "#fde047" : "#fff";

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 2, position: "relative"
    }}>
      {/* Label moved outside to prevent collision */}
      <div style={{ fontSize: 8, fontWeight: 800, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 2, marginBottom: -4 }} className="bj-score-label">{label}</div>
      <div className="bj-score-bubble" style={{
        background: bg, border: `1.5px solid ${border}`, borderRadius: 12,
        padding: "8px 16px", backdropFilter: "blur(12px)", minWidth: 64, textAlign: "center",
        boxShadow: "0 10px 30px rgba(0,0,0,0.7)", position: "relative"
      }}>
        <div className="bj-score-value" style={{ fontSize: 24, fontWeight: 900, color, fontFamily: "monospace", lineHeight: 1 }}>{displayTotal ?? (total > 0 ? total : "—")}</div>
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
  const isMobile = useIsMobile();
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
  const [showResult, setShowResult] = useState(false);
  const [muted, setMuted] = useState(false);
  const [isSplit, setIsSplit] = useState(false);
  const [splitHands, setSplitHands] = useState<Card[][] | null>(null);
  const [activeHandIndex, setActiveHandIndex] = useState(0);
  const [splitStatuses, setSplitStatuses] = useState<string[]>([]);
  const [serverSeedHash, setServerSeedHash] = useState<string | null>(null);
  const [clientSeed, setClientSeed] = useState<string | null>(null);
  const [nonce, setNonce] = useState<number | null>(null);

  const isActive = status === "active";
  const isDone = !["idle", "active"].includes(status);  // includes split_complete, player_wins, dealer_wins, push, etc.
  
  useEffect(() => {
    fetch("/api/blackjack/current", { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        if (d?.handId) {
          setHandId(d.handId);       if (d.isSplit) {
        setIsSplit(true);
        setSplitHands(d.splitHands);
        setActiveHandIndex(d.activeHandIndex);
        setSplitStatuses(d.splitStatuses || []);
      } else {
        setPlayerHand(d.playerHand);
      }
      setDealerHand(d.dealerHand);
      setPlayerTotal(d.playerTotal); setStatus(d.status); setCurrentBet(d.bet ?? 0);
      setInsuranceEligible(d.insuranceEligible ?? false);
      setServerSeedHash(d.serverSeedHash ?? null);
      setClientSeed(d.clientSeed ?? null);
      setNonce(d.nonce ?? null);
      setAmount(d.bet ?? minBet); setAmountStr(String(d.bet ?? minBet));
        }
      }).catch(() => {});
  }, []);

  // Show result only after dealer cards finish animating
  useEffect(() => {
    if (isDone && !showResult) {
      const dealerCardCount = dealerHand.length;
      const lastCardDelay = dealerCardCount * 200;
      const animationDuration = 700;
      const totalDelay = lastCardDelay + animationDuration + 300;
      
      const timer = setTimeout(() => {
        setShowResult(true);
        // Play sound based on result
        if (status === "player_blackjack") {
          soundEngine.blackjackCheer();
          soundEngine.announceVoiceLine("blackjack");
        } else if (status === "player_wins") {
          soundEngine.winFanfare();
          soundEngine.announceVoiceLine("win");
          setTimeout(() => soundEngine.crowdCheer(), 300);
        } else if (status === "player_bust" || status === "dealer_wins") {
          soundEngine.lossBuzz();
          soundEngine.announceVoiceLine("lose");
          setTimeout(() => soundEngine.crowdSigh(), 200);
        } else if (status === "split_complete") {
          // Play win or loss sound based on net payout vs total bet
          if (payout > currentBet) {
            soundEngine.winFanfare();
            soundEngine.announceVoiceLine("win");
          } else if (payout === 0) {
            soundEngine.lossBuzz();
            soundEngine.announceVoiceLine("lose");
          }
          // If payout === currentBet it's a net push — no sound needed
        }
      }, totalDelay);
      
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isDone, dealerHand.length, showResult, status]);

  useEffect(() => {
    soundEngine.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    soundEngine.init();
  }, []);

  const deal = useCallback(() => {
    requireAuth(async () => {
      if (!user || amount > parseFloat(String(user.balance))) {
        toast({ title: "Insufficient balance", variant: "destructive" }); return;
      }
      setLoading(true); setAnimatingCards(true); setShowResult(false);
      try {
        const r = await fetch("/api/blackjack/deal", {
          method: "POST", headers: authHeaders(),
          body: JSON.stringify({ gameId: game.id, amount }),
        });
        const d = await r.json();
        if (!r.ok) { toast({ title: d.error, variant: "destructive" }); return; }
        
        setTimeout(() => {
          setHandId(d.handId);
          if (d.isSplit) {
            setIsSplit(true);
            setSplitHands(d.splitHands);
            setActiveHandIndex(d.activeHandIndex);
            setSplitStatuses(d.splitStatuses || []);
          } else {
            setPlayerHand(d.playerHand);
          }
          setDealerHand(d.dealerHand);
          setPlayerTotal(d.playerTotal); setStatus(d.status); setPayout(d.payout ?? 0);
          setCurrentBet(amount); setInsuranceEligible(d.insuranceEligible ?? false);
          setDealerTotal(d.dealerTotal ?? null);
          setServerSeedHash(d.serverSeedHash ?? null);
          setClientSeed(d.clientSeed ?? null);
          setNonce(d.nonce ?? null);
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
    setLoading(true); setShowResult(false);
    try {
      const r = await fetch("/api/blackjack/action", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ handId, action: act }),
      });
      const d = await r.json();
      if (!r.ok) { toast({ title: d.error, variant: "destructive" }); return; }
      
      if (d.isSplit) {
        setIsSplit(true);
        setSplitHands(d.splitHands);
        setActiveHandIndex(d.activeHandIndex);
        setSplitStatuses(d.splitStatuses || []);
      } else {
        setPlayerHand(d.playerHand);
      }
      setDealerHand(d.dealerHand);
      setPlayerTotal(d.playerTotal); setDealerTotal(d.dealerTotal ?? null);
      setStatus(d.status as Status); setPayout(d.payout ?? 0);
      setServerSeedHash(d.serverSeedHash ?? null);
      setClientSeed(d.clientSeed ?? null);
      setNonce(d.nonce ?? null);
      if (act === "double" || act === "split") setCurrentBet(prev => prev * 2);
      if (act === "insurance") setInsuranceEligible(false);
      
      // Play voice lines for actions
      if (act === "split") {
        soundEngine.splitChime();
        soundEngine.announceVoiceLine("split");
      } else if (act === "hit") {
        soundEngine.announceVoiceLine("hit");
      } else if (act === "stand") {
        soundEngine.announceVoiceLine("stand");
      }
      
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (e: any) {
      toast({ title: "Action failed", variant: "destructive" });
    } finally { setLoading(false); }
  }, [handId, toast, queryClient]);

  const reset = () => {
    setHandId(null); setPlayerHand([]); setDealerHand([]);
    setPlayerTotal(0); setDealerTotal(null); setStatus("idle");
    setPayout(0); setCurrentBet(0); setInsuranceEligible(false); setShowResult(false);
    setIsSplit(false); setSplitHands(null); setActiveHandIndex(0); setSplitStatuses([]);
    setServerSeedHash(null); setClientSeed(null); setNonce(null);
  };

  const handleAmountChange = (val: string) => {
    setAmountStr(val);
    const n = parseFloat(val.replace(/[^0-9.]/g, ""));
    if (!isNaN(n)) setAmount(Math.min(n, maxBet));
  };

  const handleBetMultiplier = (multiplier: number) => {
    const newAmount = Math.max(minBet, Math.min(maxBet, amount * multiplier));
    setAmount(newAmount);
    setAmountStr(String(newAmount));
  };

  const handleMaxBet = () => {
    if (!user) return;
    const bal = parseFloat(String(user.balance));
    const newAmount = Math.max(minBet, Math.min(maxBet, bal));
    setAmount(newAmount);
    setAmountStr(String(newAmount));
  };

  return (
    <div className={isMobile ? "bj-game-root bj-game-root--mobile" : "bj-game-root"} style={{ display: "flex", flexDirection: isMobile ? "column" : "row", width: "100%", padding: isMobile ? 0 : 12, gap: isMobile ? 4 : 12, boxSizing: "border-box" }}>
      <style>{`
        /* Tablet only — stack controls above table */
        @media (min-width: 768px) and (max-width: 1024px) {
          .bj-game-root:not(.bj-game-root--mobile) { flex-direction: column-reverse !important; padding: 8px !important; gap: 12px !important; }
          .bj-game-root:not(.bj-game-root--mobile) .bj-table-area { min-height: auto !important; padding: 30px 10px !important; width: 100% !important; order: 2; }
          .bj-game-root:not(.bj-game-root--mobile) .bj-controls-bar { width: 100% !important; order: 1; position: static !important; }
        }

        /* Phone — column stack like Mines: felt table on top, full-width bets below */
        .bj-game-root--mobile {
          flex-direction: column !important;
          align-items: stretch !important;
          height: 100% !important;
          padding: 0 !important;
          gap: 4px !important;
          overflow: hidden !important;
        }
        .bj-game-root--mobile .bj-table-area {
          flex: 1 1 auto !important;
          min-width: 0 !important;
          min-height: 0 !important;
          width: 100% !important;
          max-height: none !important;
          padding: 6px 4px !important;
          border-width: 2px !important;
          border-radius: 10px !important;
          justify-content: center !important;
          gap: 4px !important;
          order: 1 !important;
          aspect-ratio: 4/3 !important;
        }
        .bj-game-root--mobile .bj-table-deco {
          display: block !important;
          width: 72% !important;
          height: 58% !important;
          top: 18% !important;
          border-width: 1px !important;
          opacity: 0.22 !important;
        }
        .bj-game-root--mobile .bj-deck-stack {
          display: block !important;
          top: 6px !important;
          right: 6px !important;
          width: 36px !important;
          height: 50px !important;
          transform: scale(0.55);
          transform-origin: top right;
        }
        .bj-game-root--mobile .bj-deck-stack > div {
          width: 36px !important;
          height: 50px !important;
        }
        .bj-game-root--mobile .bj-table-footer {
          display: block !important;
          bottom: 3px !important;
          font-size: 5px !important;
          letter-spacing: 0.5px !important;
          opacity: 0.55 !important;
        }
        .bj-game-root--mobile .bj-table-title {
          font-size: 7px !important;
          letter-spacing: 1px !important;
          top: 4px !important;
        }
        .bj-game-root--mobile .bj-card-container {
          width: 42px !important;
          height: 58px !important;
        }
        .bj-game-root--mobile .bj-card-container .bj-card-front-rank { font-size: 12px !important; }
        .bj-game-root--mobile .bj-card-container .bj-card-front-suit-sm { font-size: 10px !important; }
        .bj-game-root--mobile .bj-card-container .bj-card-front-suit-lg { font-size: 18px !important; }
        .bj-game-root--mobile .bj-score-bubble { padding: 4px 8px !important; min-width: 44px !important; }
        .bj-game-root--mobile .bj-score-value { font-size: 14px !important; }
        .bj-game-root--mobile .bj-score-label { font-size: 6px !important; margin-bottom: 0 !important; }
        .bj-game-root--mobile .bj-controls-bar {
          flex: 0 0 auto !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          padding: 6px 8px !important;
          gap: 4px !important;
          overflow: visible !important;
          order: 2 !important;
        }
        .bj-game-root--mobile .bj-controls-bar input {
          font-size: 12px !important;
          padding: 6px 6px 6px 20px !important;
        }
        .bj-game-root--mobile .bj-controls-bar .bj-mute-btn {
          width: 32px !important;
          height: 32px !important;
          font-size: 14px !important;
          flex-shrink: 0;
        }
        .bj-game-root--mobile .bj-bet-mult button {
          padding: 5px 2px !important;
          font-size: 9px !important;
        }
        .bj-game-root--mobile .bj-action-btn {
          padding: 7px 4px !important;
          font-size: 9px !important;
        }
        .bj-game-root--mobile .bj-place-bet-btn {
          padding: 8px !important;
          font-size: 10px !important;
        }
        .bj-game-root--mobile .bj-pf-panel { display: none !important; }
        .bj-game-root--mobile .bj-hand-row { min-height: 58px !important; gap: 4px !important; }
        @keyframes bj-card-deal {
          0% { transform: translate(var(--deal-start-x, 0), var(--deal-start-y, 0)) rotate(45deg); opacity: 0; }
          100% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
        }
        @keyframes bj-result-pop {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes bj-pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(255,215,0,0.3); }
          50% { box-shadow: 0 0 40px rgba(255,215,0,0.6); }
        }
        .bj-card-inner.is-hidden { transform: rotateY(0deg) !important; }
        .bj-card-inner:not(.is-hidden) { transform: rotateY(180deg); }
        .bj-action-btn { transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .bj-action-btn:hover:not(:disabled) { transform: translateY(-2px) scale(1.05); filter: brightness(1.1); }
        .bj-action-btn:active:not(:disabled) { transform: scale(0.95); }
        .bj-result-badge {
          animation: bj-result-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .bj-blackjack-badge {
          animation: bj-pulse-glow 1.5s ease-in-out infinite;
        }
      `}</style>

      {/* ── TABLE AREA ── */}
      <div className="bj-table-area" style={{
        flex: 1, position: "relative", minHeight: isMobile ? 0 : 520, 
        background: `radial-gradient(ellipse at 50% 10%, ${felt.felt} 0%, #050505 100%)`,
        border: `4px solid ${felt.rail}`, boxShadow: isMobile ? "0 4px 16px rgba(0,0,0,0.6)" : "0 20px 50px rgba(0,0,0,0.8)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: isMobile ? "center" : "space-between",
        padding: isMobile ? "8px 4px" : "40px 20px", overflow: "hidden", borderRadius: isMobile ? 10 : 16
      }}>
        {/* Table Decoration */}
        <div className="bj-table-deco" style={{
          position: "absolute", top: "15%", width: "80%", height: "70%",
          border: `2px solid ${felt.text}`, borderRadius: "50%", opacity: 0.3, pointerEvents: "none", zIndex: 2
        }} />

        {/* Game Title */}
        <div className="bj-table-title" style={{
          position: "absolute", top: 12, left: 0, right: 0, textAlign: "center",
          fontSize: 11, fontWeight: 900, letterSpacing: 3, color: felt.text,
          textTransform: "uppercase", zIndex: 3
        }}>
          ♠ Blackjack ♠
        </div>

        {/* Deck on Top Right */}
        <div ref={deckRef} className="bj-deck-stack" style={{ position: "absolute", top: 20, right: 20, width: 60, height: 85, zIndex: 5 }}>
          {[3, 2, 1, 0].map(i => (
            <div key={i} style={{
              position: "absolute", width: 60, height: 85, borderRadius: 6,
              background: "linear-gradient(145deg, #1e3a8a, #0c1445)",
              border: "1px solid rgba(255,255,255,0.2)",
              top: i * -1.5, right: i * 1, zIndex: 5 - i,
              boxShadow: "0 4px 10px rgba(0,0,0,0.5)"
            }} />
          ))}
        </div>

        {/* Dealer Section */}
        <div style={{ position: "relative", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: isMobile ? 4 : 12, zIndex: 10 }}>
          <div style={{ position: "relative", display: "flex", gap: isMobile ? 4 : 10, minHeight: isMobile ? 58 : 118 }} className="bj-hand-row">
            {dealerHand.length > 0 ? dealerHand.map((c, i) => (
              <div key={`d-${i}`} style={{ position: "relative", transform: isMobile ? "scale(1.0)" : "none", transformOrigin: "top center" }}>
                <PlayingCard card={c} hidden={c.suit === "?"} delay={i * 200} dealFrom={deckRef.current?.getBoundingClientRect()} isMobile={isMobile} />
              </div>
            )) : <div style={{ width: isMobile ? 70 : 85, height: isMobile ? 98 : 118, border: "2px dashed rgba(255,255,255,0.05)", borderRadius: 8 }} />}
          </div>
          {dealerHand.length > 0 && (
            <div style={{ marginTop: isMobile ? -12 : 0 }}>
              <ScoreBubble 
                total={dealerTotal ?? (isDone && showResult ? handTotal(dealerHand) : handTotal(dealerHand.filter(c => c.suit !== "?")))} 
                displayTotal={isDone && showResult ? getSoftTotalString(dealerHand) : getSoftTotalString(dealerHand.filter(c => c.suit !== "?"))}
                bust={dealerTotal !== null && dealerTotal > 21} 
                label="DEALER" 
              />
            </div>
          )}
        </div>

        {/* Result Overlay */}
        {isDone && showResult && (
          <div className={`bj-result-badge ${status === "player_blackjack" ? "bj-blackjack-badge" : ""}`} style={{
            zIndex: 50, textAlign: "center", background: "rgba(0,0,0,0.95)", padding: "16px 40px", borderRadius: 16,
            border: `2px solid ${accent}`, boxShadow: `0 0 40px ${accent}66`
          }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: accent, letterSpacing: 2, textTransform: "uppercase" }}>
              {status === "player_blackjack" ? "BLACKJACK!"
                : status === "player_wins" ? "YOU WIN"
                : status === "player_bust" ? "BUST"
                : status === "dealer_wins" ? "DEALER WINS"
                : status === "push" ? "PUSH"
                : status === "split_complete" ? (
                    splitStatuses.every(s => s === "dealer_wins") ? "DEALER WINS"
                    : splitStatuses.every(s => s === "push") ? "PUSH"
                    : splitStatuses.every(s => s === "player_wins" || s === "player_blackjack") ? "YOU WIN"
                    : "SPLIT RESULT"
                  )
                : "PUSH"}
            </div>
            {payout > 0 && <div style={{ fontSize: 20, fontWeight: 900, color: "#22c55e", marginTop: 6 }}>+{formatCurrency(payout)}</div>}
          </div>
        )}

        {/* Player Section */}
        <div style={{ position: "relative", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: isMobile ? 4 : 12, zIndex: 10 }}>
          {!isSplit ? (
            <>
              {playerHand.length > 0 && (
                <div style={{ marginBottom: isMobile ? -8 : 0 }}>
                  <ScoreBubble total={playerTotal} displayTotal={getSoftTotalString(playerHand)} bust={playerTotal > 21} bj={status === "player_blackjack"} label="YOU" />
                </div>
              )}
              <div style={{ position: "relative", display: "flex", gap: isMobile ? 4 : 10, minHeight: isMobile ? 58 : 118 }} className="bj-hand-row">
                {playerHand.length > 0 ? playerHand.map((c, i) => (
                  <div key={`p-${i}`} style={{ position: "relative", transform: isMobile ? "scale(1.0)" : "none", transformOrigin: "bottom center" }}>
                    <PlayingCard card={c} delay={(i + 2) * 200} dealFrom={deckRef.current?.getBoundingClientRect()} isMobile={isMobile} />
                  </div>
                )) : <div style={{ width: isMobile ? 70 : 85, height: isMobile ? 98 : 118, border: "2px dashed rgba(255,255,255,0.05)", borderRadius: 8 }} />}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", gap: isMobile ? 8 : 20, justifyContent: "center", width: "100%", flexWrap: "wrap" }}>
              {splitHands?.map((hand, idx) => (
                <div key={`split-hand-${idx}`} style={{ 
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8, 
                  opacity: activeHandIndex === idx ? 1 : 0.5, 
                  transform: activeHandIndex === idx ? "scale(1.05)" : "scale(0.95)", 
                  transition: "all 0.3s",
                  minWidth: isMobile ? 120 : 160
                }}>
                  <ScoreBubble 
                    total={handTotal(hand)} 
                    displayTotal={getSoftTotalString(hand)} 
                    bust={handTotal(hand) > 21} 
                    label={`HAND ${idx + 1}`} 
                  />
                  <div style={{ display: "flex", gap: 4, position: "relative" }}>
                    {hand.map((c, i) => (
                      <div key={`sh-${idx}-${i}`} style={{ marginLeft: i > 0 ? (isMobile ? -25 : -40) : 0 }}>
                        <PlayingCard card={c} isMobile={isMobile} />
                      </div>
                    ))}
                  </div>
                  {splitStatuses[idx] && splitStatuses[idx] !== "active" && (
                    <div style={{ fontSize: 10, fontWeight: 900, color: accent }}>
                      {splitStatuses[idx].replace("_", " ").toUpperCase()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Table Rules */}
        <div className="bj-table-footer" style={{
          position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center",
          fontSize: 8, fontWeight: 700, color: felt.text, textTransform: "uppercase", letterSpacing: 1, opacity: 0.7
        }}>
          <div>BLACKJACK PAYS 3 TO 2 · INSURANCE PAYS 2 TO 1</div>
        </div>
      </div>

      {/* ── CONTROLS BAR ── */}
      <div className="bj-controls-bar bj-bet-panel" style={{
        display: "flex", flexDirection: "column", gap: isMobile ? 5 : 12, background: "rgba(8,12,26,0.9)", borderRadius: 12, padding: isMobile ? 6 : 14,
        border: "1px solid rgba(255,255,255,0.08)", width: isMobile ? undefined : 280, maxWidth: isMobile ? undefined : 280, flexShrink: isMobile ? 0 : undefined
      }}>
        {/* Bet Input Row */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>$</span>
            <input type="text" value={amountStr} onChange={e => handleAmountChange(e.target.value)} disabled={isActive}
              style={{
                width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
                padding: "10px 10px 10px 25px", color: "#fff", fontWeight: 700, fontFamily: "monospace", outline: "none", fontSize: 13
              }} />
          </div>
          <button onClick={() => setMuted(!muted)} className="bj-mute-btn" style={{
            width: 40, height: 40, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
            color: muted ? "#ef4444" : "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            {muted ? "🔇" : "🔊"}
          </button>
        </div>

        {/* Bet Multipliers */}
        <div className="bj-bet-mult" style={{ display: "flex", gap: isMobile ? 4 : 6 }}>
          <button onClick={() => handleBetMultiplier(0.5)} disabled={isActive} style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: isMobile ? 6 : 8, color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>1/2</button>
          <button onClick={() => handleBetMultiplier(2)} disabled={isActive} style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: isMobile ? 6 : 8, color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>2x</button>
          <button onClick={handleMaxBet} disabled={isActive} style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: isMobile ? 6 : 8, color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>MAX</button>
        </div>

        {/* Main Action Buttons */}
        {status === "idle" || isDone ? (
          <button onClick={isDone ? reset : deal} disabled={loading} className="bj-place-bet-btn" style={{
            width: "100%", background: accent, color: "#000", border: "none", borderRadius: 10, padding: isMobile ? 12 : 14,
            fontWeight: 900, fontSize: isMobile ? 13 : 14, letterSpacing: 1, cursor: "pointer", boxShadow: `0 4px 15px ${accent}44`, textTransform: "uppercase"
          }}>
            {isDone ? "NEW GAME" : loading ? "DEALING..." : "PLACE BET"}
          </button>
        ) : (
          <div className="bj-action-row" style={{ display: "flex", flexDirection: "column", gap: isMobile ? 6 : 8 }}>
            <div className="bj-action-row" style={{ display: "flex", gap: isMobile ? 6 : 8 }}>
              <button onClick={() => doAction("hit")} disabled={loading} className="bj-action-btn" style={{ flex: 1, background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, padding: isMobile ? 10 : 12, fontWeight: 900, fontSize: 12 }}>HIT</button>
              <button onClick={() => doAction("stand")} disabled={loading} className="bj-action-btn" style={{ flex: 1, background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, padding: isMobile ? 10 : 12, fontWeight: 900, fontSize: 12 }}>STAND</button>
            </div>
            <div className="bj-action-row" style={{ display: "flex", gap: isMobile ? 6 : 8 }}>
              <button onClick={() => doAction("double")} disabled={loading || (isSplit ? (splitHands?.[activeHandIndex]?.length ?? 0) !== 2 : playerHand.length !== 2)} className="bj-action-btn" style={{ flex: 1, background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: isMobile ? 8 : 10, fontWeight: 800, fontSize: 11 }}>DOUBLE</button>
              {insuranceEligible && <button onClick={() => doAction("insurance")} disabled={loading} className="bj-action-btn" style={{ flex: 1, background: "#d97706", color: "#fff", border: "none", borderRadius: 8, padding: isMobile ? 8 : 10, fontWeight: 800, fontSize: 11 }}>INSURE</button>}
              {((!isSplit && playerHand.length === 2 && playerHand[0].rank === playerHand[1].rank) || 
                 (isSplit && splitHands?.[activeHandIndex]?.length === 2 && splitHands[activeHandIndex][0].rank === splitHands[activeHandIndex][1].rank && splitHands.length < 4)) && (
                <button onClick={() => doAction("split")} disabled={loading} className="bj-action-btn" style={{ flex: 1, background: "#0ea5e9", color: "#fff", border: "none", borderRadius: 8, padding: isMobile ? 8 : 10, fontWeight: 800, fontSize: 11 }}>SPLIT</button>
              )}
            </div>
          </div>
        )}

        {/* Min/Max Info */}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "rgba(255,255,255,0.4)", padding: "0 4px" }}>
          <span>Min: {formatCurrency(minBet)}</span>
          <span>Max: {formatCurrency(maxBet)}</span>
        </div>

        {/* Provably Fair */}
        {serverSeedHash && clientSeed !== null && nonce !== null && handId && (
          <ProvablyFairPanel
            serverSeedHash={serverSeedHash}
            clientSeed={clientSeed}
            nonce={nonce}
            verifyPath={`/api/blackjack/verify/${handId}`}
            variant={isDone ? "full" : "compact"}
            gameName="blackjack"
          />
        )}
      </div>
    </div>
  );
}
