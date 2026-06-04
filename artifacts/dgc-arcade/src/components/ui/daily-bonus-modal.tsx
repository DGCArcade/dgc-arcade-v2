import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";
import { Button } from "./button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Gift, Star } from "lucide-react";

interface DailyBonusStatus {
  claimed: boolean;
  bonusAmount: number;
  claimedDate: string | null;
}

function getToken() {
  return typeof localStorage !== "undefined" ? localStorage.getItem("dgc_token") : null;
}

interface DailyBonusModalProps {
  open: boolean;
  onClose: () => void;
}

export function DailyBonusModal({ open, onClose }: DailyBonusModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DailyBonusStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [claimAmount, setClaimAmount] = useState(0);

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
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast({ title: `Daily Bonus Claimed!`, description: `+${formatCurrency(data.bonusAmount)} added to your balance.` });
      } else {
        toast({ title: "Already Claimed", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
    setLoading(false);
  };

  const alreadyClaimed = status?.claimed || claimed;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm bg-card border-border/60 backdrop-blur-xl text-center">
        <DialogHeader>
          <DialogTitle className="font-display font-black text-2xl uppercase tracking-widest flex items-center justify-center gap-2">
            <Gift className="w-6 h-6 text-primary" />
            Daily Bonus
          </DialogTitle>
        </DialogHeader>

        <div className="py-6 space-y-6">
          {/* Animated gift */}
          <div className="relative mx-auto w-28 h-28">
            <div className={`w-28 h-28 rounded-full flex items-center justify-center border-4 ${alreadyClaimed ? "border-green-500/50 bg-green-500/10" : "border-primary/50 bg-primary/10"}`}
              style={{ boxShadow: alreadyClaimed ? "0 0 32px rgba(0,200,0,0.3)" : "0 0 32px var(--theme-glow-strong)" }}>
              {claimed ? (
                <span className="text-5xl">🎉</span>
              ) : alreadyClaimed ? (
                <span className="text-5xl">✅</span>
              ) : (
                <Gift className="w-14 h-14 text-primary" />
              )}
            </div>
            {!alreadyClaimed && (
              <>
                {[0,60,120,180,240,300].map(deg => (
                  <div key={deg} className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-primary"
                    style={{ transform: `rotate(${deg}deg) translateX(62px) translateY(-50%)`, opacity: 0.5 }} />
                ))}
              </>
            )}
          </div>

          {claimed ? (
            <div className="space-y-2">
              <div className="text-3xl font-mono font-black text-primary">+{formatCurrency(claimAmount)}</div>
              <p className="text-muted-foreground text-sm">Added to your balance!</p>
            </div>
          ) : alreadyClaimed ? (
            <div className="space-y-2">
              <p className="font-bold text-lg text-muted-foreground">Already claimed today!</p>
              <p className="text-sm text-muted-foreground">Come back tomorrow for your next bonus.</p>
              <div className="text-xs font-mono text-muted-foreground/60">Next bonus in ~{24 - new Date().getHours()}h</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="text-3xl font-mono font-black text-primary">
                  {status ? `+${formatCurrency(status.bonusAmount)}` : "Loading…"}
                </div>
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
