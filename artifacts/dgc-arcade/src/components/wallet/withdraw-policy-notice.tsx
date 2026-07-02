import { Shield, Coins } from "lucide-react";
import { useWagerRequirement } from "@/hooks/use-wager-requirement";

export function WithdrawPolicyNotice({ compact = false }: { compact?: boolean }) {
  const { isWagerMet, wagerPercentage, formattedRemaining, formattedRequirement } = useWagerRequirement();

  return (
    <div className={`rounded-xl border space-y-3 ${compact ? "p-3" : "p-4"} ${isWagerMet ? "border-green-500/30 bg-green-500/5" : "border-primary/25 bg-primary/5"}`}>
      <div className="flex items-start gap-2">
        <Shield className={`w-4 h-4 shrink-0 mt-0.5 ${isWagerMet ? "text-green-400" : "text-primary"}`} />
        <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p className="font-bold uppercase tracking-wider text-foreground text-[10px]">Withdrawal policy</p>
          <p>
            <strong className="text-foreground">Playthrough:</strong>{" "}
            {isWagerMet
              ? "You've met the 100% wagering requirement on deposits and bonus."
              : `Wager ${formattedRemaining} more (${wagerPercentage}% of ${formattedRequirement} done) before cashing out.`}
          </p>
          <p className="flex items-start gap-1.5">
            <Coins className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
            <span>
              <strong className="text-foreground">Same-coin payouts:</strong> Withdraw only in cryptocurrencies you've deposited.
              BTC in → BTC out. You can't cash out ETH until you've deposited ETH.
            </span>
          </p>
        </div>
      </div>
      {!compact && !isWagerMet && (
        <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/5">
          <div
            className="h-full bg-gradient-to-r from-primary/80 to-amber-400 transition-all duration-700"
            style={{ width: `${wagerPercentage}%` }}
          />
        </div>
      )}
    </div>
  );
}
