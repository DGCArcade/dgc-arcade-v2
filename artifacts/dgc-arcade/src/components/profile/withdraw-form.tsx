import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRequestWithdrawal, getListTransactionsQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { CoinIcon, CURRENCIES } from "@/components/wallet/coin-icon";
import { formatCurrency } from "@/lib/format";
import { RefreshCw, ShieldAlert, CheckCircle2 } from "lucide-react";

const withdrawSchema = z.object({
  amount: z.coerce.number().min(1, "Minimum withdrawal is $1"),
  currency: z.string().min(1, "Please select a currency"),
  address: z.string().min(10, "Please enter a valid wallet address"),
});

interface CoinBalanceData {
  balances: Record<string, number>;
  totalBalance: number;
  staticBalance: number;
  cryptoAmounts: Record<string, { amount: number; price: number; usdValue: number }>;
}

export function WithdrawForm() {
  const { toast } = useToast();
  const requestWithdrawal = useRequestWithdrawal();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isCreator = user?.withdrawalsEnabled === false;

  // Wagering requirement calculation
  const totalWagered = parseFloat(String((user as any)?.totalWageredAmount ?? 0));
  const signupBonus = parseFloat(String((user as any)?.signupBonus ?? 100));
  const wagerRequirement = signupBonus * 1.0; // 100% of signup bonus
  const wagerRemaining = Math.max(0, wagerRequirement - totalWagered);
  const wagerProgress = totalWagered / wagerRequirement;
  const wagerPercentage = Math.min(100, Math.round(wagerProgress * 100));
  const isWagerMet = wagerRemaining <= 0;

  // Live coin balance data from backend
  const [coinData, setCoinData] = useState<CoinBalanceData>({
    balances: {},
    totalBalance: 0,
    staticBalance: 0,
    cryptoAmounts: {},
  });
  const [coinBalancesLoading, setCoinBalancesLoading] = useState(true);

  const fetchCoinBalances = useCallback(async () => {
    setCoinBalancesLoading(true);
    try {
      const token = localStorage.getItem("dgc_token");
      const r = await fetch("/api/transactions/coin-balances", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const d: CoinBalanceData = await r.json();
        setCoinData(d);
      }
    } catch (_) {
      // Silently fail
    } finally {
      setCoinBalancesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCoinBalances();
    const interval = setInterval(fetchCoinBalances, 15_000);
    return () => clearInterval(interval);
  }, [fetchCoinBalances]);

  const liveTotal = coinData.totalBalance > 0 ? coinData.totalBalance : (user?.balance ?? 0);
  const hasCryptoBalances = Object.keys(coinData.balances).length > 0;

  const availableCurrencies = hasCryptoBalances
    ? CURRENCIES.filter(c => (coinData.balances[c.value] ?? 0) > 0)
    : liveTotal > 0 ? CURRENCIES : [];

  const firstAvailable = availableCurrencies[0]?.value ?? "";

  const form = useForm<z.infer<typeof withdrawSchema>>({
    resolver: zodResolver(withdrawSchema),
    defaultValues: { amount: 1, currency: "", address: "" },
  });

  useEffect(() => {
    if (!coinBalancesLoading && firstAvailable && !form.getValues("currency")) {
      form.setValue("currency", firstAvailable);
    }
  }, [coinBalancesLoading, firstAvailable, form]);

  const selectedCurrency = form.watch("currency");
  const coinLiveUsd = coinData.balances[selectedCurrency] ?? 0;

  const onSubmit = (values: z.infer<typeof withdrawSchema>) => {
    if (!user) return;

    if (!isWagerMet) {
      toast({
        title: "Wagering Requirement Not Met",
        description: `You need to wager ${formatCurrency(wagerRemaining)} more before you can withdraw.`,
        variant: "destructive",
      });
      return;
    }

    if (values.amount > liveTotal) {
      form.setError("amount", { message: `Amount exceeds your live balance of ${formatCurrency(liveTotal)}` });
      return;
    }

    if (hasCryptoBalances) {
      const coinMax = coinData.balances[values.currency] ?? 0;
      if (coinMax > 0 && values.amount > coinMax) {
        form.setError("amount", {
          message: `Max ${formatCurrency(coinMax)} for ${values.currency.split("_")[0]} (live balance at current price)`,
        });
        return;
      }
    }

    requestWithdrawal.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({ title: "Withdrawal Requested", description: "Your withdrawal is being processed." });
          form.reset({ amount: 1, currency: firstAvailable, address: "" });
          queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          fetchCoinBalances();
        },
        onError: (err) => {
          toast({
            title: "Withdrawal Failed",
            description: err.data?.error || "Could not request withdrawal",
            variant: "destructive",
          });
        },
      }
    );
  };

  if (isCreator) {
    return (
      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-6 text-center space-y-2">
        <p className="font-display font-black uppercase tracking-widest text-yellow-400">Withdrawals Unavailable</p>
        <p className="text-sm text-muted-foreground">Please contact DGC Arcade support to process a withdrawal for your account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Wagering Requirement Status Card */}
      <div className={`rounded-xl border p-5 space-y-4 transition-all ${isWagerMet ? "border-green-500/30 bg-green-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {isWagerMet ? (
                <CheckCircle2 className="w-4 h-4 text-green-400" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-amber-400" />
              )}
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Wagering Requirement</span>
            </div>
            <div className={`text-2xl font-black font-display tracking-tight ${isWagerMet ? "text-green-400" : "text-amber-400"}`}>
              {wagerPercentage}% Complete
            </div>
          </div>
          <div className="text-right space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Remaining</span>
            <div className="font-mono font-black text-lg text-foreground">
              {formatCurrency(wagerRemaining)}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-white/5 rounded-full h-2.5 overflow-hidden border border-white/5">
          <div
            className={`h-full transition-all duration-1000 ease-out ${isWagerMet ? "bg-gradient-to-r from-green-500 to-emerald-400" : "bg-gradient-to-r from-amber-500 to-orange-400"}`}
            style={{ width: `${wagerPercentage}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground leading-relaxed max-w-[240px]">
            {isWagerMet ? (
              <span className="text-green-400/90">✓ You've met the 100% wagering requirement! Withdrawals are now unlocked.</span>
            ) : (
              <span>You must wager 100% of your sign-up bonus before withdrawing. Play any game to unlock!</span>
            )}
          </p>
          {!isWagerMet && (
            <div className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] font-bold text-amber-400 uppercase tracking-tighter">
              Locked
            </div>
          )}
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          {/* Live balance summary */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Live Balance</div>
              <div className="font-mono font-black text-xl text-primary">{formatCurrency(liveTotal)}</div>
            </div>
            <button
              type="button"
              onClick={fetchCoinBalances}
              disabled={coinBalancesLoading}
              className="text-muted-foreground hover:text-primary transition-colors p-2 rounded"
              title="Refresh live balance"
            >
              <RefreshCw className={`w-4 h-4 ${coinBalancesLoading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase tracking-wider font-bold">Withdraw In</FormLabel>
                <FormControl>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {availableCurrencies.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => field.onChange(c.value)}
                        className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                          field.value === c.value
                            ? "border-primary bg-primary/10"
                            : "border-border bg-secondary/50 hover:border-primary/40"
                        }`}
                      >
                        <CoinIcon currency={c.value} className="w-5 h-5" />
                        <div className="text-left">
                          <div className="text-[10px] font-bold leading-none">{c.name}</div>
                          <div className="text-[9px] text-muted-foreground font-mono">
                            {formatCurrency(coinData.balances[c.value] ?? 0)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase tracking-wider font-bold">Amount (USD)</FormLabel>
                <FormControl>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                    <Input
                      {...field}
                      type="number"
                      placeholder="0.00"
                      className="pl-7 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => form.setValue("amount", Math.floor(coinLiveUsd * 100) / 100)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase bg-primary/10 hover:bg-primary/20 text-primary px-2 py-1 rounded transition-colors"
                    >
                      Max
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase tracking-wider font-bold">Wallet Address</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Enter your crypto address" className="font-mono text-xs" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full h-12 font-display font-black uppercase tracking-widest text-lg"
            disabled={requestWithdrawal.isPending || !isWagerMet}
          >
            {requestWithdrawal.isPending ? "Processing..." : isWagerMet ? "Withdraw Funds" : "Requirement Not Met"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
