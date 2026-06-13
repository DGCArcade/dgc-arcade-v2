import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";
import { Button } from "./button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Gift, Star, Flame, Zap } from "lucide-react";

interface DailyBonusStatus {
  claimed: boolean;
  bonusAmount: number;
  baseAmount: number;
  streakDay: number;
  maxStreak: boolean;
  nextStreakAmount: number;
  claimedDate: string | null;
}

function getToken() {
  return typeof localStorage !== "undefined" ? localStorage.getItem("dgc_token") : null;
}

interface DailyBonusModalProps {
  open: boolean;
  onClose: () => void;
}

function StreakBubble({ day, active }: { day: number; active: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-0.5 ${active ? "" : "opacity-40"}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
        active ? "border-primary bg-primary/20 text-primary" : "border-border bg-secondary text-muted-foreground"
      }`}>
        {day}
      </div>
    </div>
  );
}

export function DailyBonusModal({ open, onClose }: DailyBonusModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DailyBonusStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [claimAmount, setClaimAmount] = useState(0);
  const [claimStreak, setClaimStreak] = useState(1);

  useEffect(() => {
    if (!open) return;
    fetch("/api/daily-bonus/status", {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {});
  }, [open]);

  const handleClaim = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/daily-bonus/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (res.ok) {
        setClaimed(true);
        setClaimAmount(data.bonusAmount);
        setClaimStreak(data.streakDay);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast({
          title: `🔥 Day ${data.streakDay} Streak!`,
          description: `+${formatCurrency(data.bonusAmount)} added to your balance.`,
        });
      } else {
        toast({ title: "Already Claimed", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
    setLoading(false);
  };

  const alreadyClaimed = status?.claimed || claimed;
  const streakDay = claimed ? claimStreak : (status?.streakDay ?? 1);
  const streakMultiplier = Math.min(1 + 0.1 * (streakDay - 1), 2.0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm bg-card border-border/60 backdrop-blur-xl text-center">
        <DialogHeader>
          <DialogTitle className="font-display font-black text-2xl uppercase tracking-widest flex items-center justify-center gap-2">
            <Gift className="w-6 h-6 text-primary" />
            Daily Bonus
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-5">
          {/* Streak counter */}
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            {Array.from({ length: Math.max(7, streakDay + 1) }, (_, i) => i + 1).slice(0, 7).map(d => (
              <StreakBubble key={d} day={d} active={d <= streakDay} />
            ))}
            {streakDay > 7 && (
              <div className="flex items-center gap-1 text-primary font-bold text-sm ml-1">
                <Flame className="w-4 h-4" />{streakDay}
              </div>
            )}
          </div>

          {streakDay > 1 && (
            <div className="flex items-center justify-center gap-2 bg-primary/10 rounded-full px-4 py-1.5 mx-auto w-fit border border-primary/20">
              <Flame className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-bold text-primary">
                {streakDay}-Day Streak! {streakMultiplier.toFixed(1)}× bonus
              </span>
            </div>
          )}

          {/* Animated gift */}
          <div className="relative mx-auto w-24 h-24">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center border-4 transition-all ${
              alreadyClaimed ? "border-green-500/50 bg-green-500/10" : "border-primary/50 bg-primary/10"
            }`}
              style={{ boxShadow: alreadyClaimed ? "0 0 32px rgba(0,200,0,0.3)" : "0 0 32px var(--theme-glow-strong)" }}>
              {claimed ? (
                <span className="text-4xl">🎉</span>
              ) : alreadyClaimed ? (
                <span className="text-4xl">✅</span>
              ) : (
                <Gift className="w-12 h-12 text-primary" />
              )}
            </div>
          </div>

          {claimed ? (
            <div className="space-y-1">
              <div className="text-3xl font-mono font-black text-primary">+{formatCurrency(claimAmount)}</div>
              <p className="text-muted-foreground text-sm">Added to your balance!</p>
              {claimStreak > 1 && (
                <p className="text-xs text-orange-400 font-bold">🔥 {claimStreak}-day streak bonus applied!</p>
              )}
            </div>
          ) : alreadyClaimed ? (
            <div className="space-y-2">
              <p className="font-bold text-lg text-muted-foreground">Already claimed today!</p>
              {streakDay > 1 && status && (
                <div className="bg-secondary/60 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex items-center justify-center gap-1.5 text-primary font-bold">
                    <Zap className="w-4 h-4" />
                    Tomorrow: +{formatCurrency(status.nextStreakAmount)}
                    {streakDay < 10 && <span className="text-xs text-muted-foreground">(day {streakDay + 1})</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">Keep your streak going!</p>
                </div>
              )}
              <div className="text-xs font-mono text-muted-foreground/60">
                Next bonus in ~{24 - new Date().getHours()}h
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="text-3xl font-mono font-black text-primary">
                  {status ? `+${formatCurrency(status.bonusAmount)}` : "Loading…"}
                </div>
                {status && streakDay > 1 && (
                  <p className="text-xs text-orange-400 font-bold">
                    🔥 {streakDay}-day streak: {(streakMultiplier).toFixed(1)}× base bonus!
                  </p>
                )}
                <p className="text-muted-foreground text-sm">Free daily bonus — no strings attached!</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "New Player", amount: "$2", color: "text-muted-foreground" },
                  { label: "VIP Player", amount: "$25", color: "text-primary" },
                  { label: "High Roller", amount: "$100", color: "text-yellow-400" },
                ].map(t => (
                  <div key={t.label} className="bg-secondary/60 rounded-lg p-2 border border-border/50">
                    <div className={`font-mono font-bold text-sm ${t.color}`}>{t.amount}</div>
                    <div className="text-xs text-muted-foreground/70 mt-0.5">{t.label}</div>
                  </div>
                ))}
              </div>
              {status && status.streakDay < 11 && (
                <div className="text-xs text-muted-foreground bg-secondary/40 rounded-lg px-3 py-2">
                  Claim every day to build your streak. 11+ days = <strong className="text-primary">2× bonus</strong>
                </div>
              )}
            </div>
          )}
        </div>

        {!alreadyClaimed ? (
          <Button className="w-full font-bold uppercase tracking-widest h-12 btn-pulse" onClick={handleClaim} disabled={loading}>
            <Star className="w-4 h-4 mr-2" />
            {loading ? "Claiming…" : "Claim Bonus"}
          </Button>
        ) : (
          <Button variant="outline" className="w-full font-bold uppercase" onClick={onClose}>
            Close
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
