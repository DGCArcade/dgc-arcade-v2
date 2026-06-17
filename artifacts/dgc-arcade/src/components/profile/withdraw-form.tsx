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
import { RefreshCw } from "lucide-react";

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
    // Refresh every 15 seconds for live prices
    const interval = setInterval(fetchCoinBalances, 15_000);
    return () => clearInterval(interval);
  }, [fetchCoinBalances]);

  // Live total balance (prefer backend live value, fall back to useAuth)
  const liveTotal = coinData.totalBalance > 0 ? coinData.totalBalance : (user?.balance ?? 0);
  const hasCryptoBalances = Object.keys(coinData.balances).length > 0;

  // Available currencies: coins with live balance, or all coins for old users
  const availableCurrencies = hasCryptoBalances
    ? CURRENCIES.filter(c => (coinData.balances[c.value] ?? 0) > 0)
    : liveTotal > 0 ? CURRENCIES : [];

  const firstAvailable = availableCurrencies[0]?.value ?? "";

  const form = useForm<z.infer<typeof withdrawSchema>>({
    resolver: zodResolver(withdrawSchema),
    defaultValues: { amount: 1, currency: "", address: "" },
  });

  // Auto-select first available coin once balances load
  useEffect(() => {
    if (!coinBalancesLoading && firstAvailable && !form.getValues("currency")) {
      form.setValue("currency", firstAvailable);
    }
  }, [coinBalancesLoading, firstAvailable]);

  const selectedCurrency = form.watch("currency");

  // Max for selected coin
  const coinLiveUsd = coinData.balances[selectedCurrency] ?? 0;
  const maxForCoin = hasCryptoBalances
    ? Math.min(coinLiveUsd, liveTotal)
    : liveTotal;

  const onSubmit = (values: z.infer<typeof withdrawSchema>) => {
    if (!user) return;

    // Frontend guard: cannot exceed live total
    if (values.amount > liveTotal) {
      form.setError("amount", { message: `Amount exceeds your live balance of ${formatCurrency(liveTotal)}` });
      return;
    }

    // Frontend guard: cannot exceed coin-specific live balance
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
          // Invalidate BOTH transactions list AND user balance
          queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          // Also refresh live coin balances
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

        {/* Currency selector — only coins with live balance are selectable */}
        <FormField
          control={form.control}
          name="currency"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs uppercase tracking-wider font-bold">Withdraw In</FormLabel>
              <FormControl>
                <div className="flex gap-2 flex-wrap">
                  {coinBalancesLoading ? (
                    <div className="h-8 w-full bg-secondary animate-pulse rounded-lg" />
                  ) : availableCurrencies.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No balance available — deposit first to unlock withdrawals.</p>
                  ) : (
                    CURRENCIES.map(c => {
                      const liveUsd = coinData.balances[c.value] ?? 0;
                      const isAvailable = hasCryptoBalances ? liveUsd > 0 : liveTotal > 0;
                      return (
                        <button
                          key={c.value}
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => {
                            field.onChange(c.value);
                            // Clamp amount to new coin max
                            const currentAmt = form.getValues("amount");
                            const newMax = hasCryptoBalances ? Math.min(liveUsd, liveTotal) : liveTotal;
                            if (currentAmt > newMax) form.setValue("amount", Math.max(1, Math.floor(newMax)));
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                            !isAvailable
                              ? "border-border/20 bg-secondary/20 text-muted-foreground/30 opacity-40 cursor-not-allowed"
                              : field.value === c.value
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border/50 bg-secondary/40 text-muted-foreground hover:border-primary/40"
                          }`}
                          title={
                            isAvailable
                              ? hasCryptoBalances
                                ? `Live: ${formatCurrency(liveUsd)}`
                                : `Available: ${formatCurrency(liveTotal)}`
                              : "No balance in this coin"
                          }
                        >
                          <CoinIcon currency={c.value} size={16} />
                          <span>{c.name === "Tether USDT" ? "USDT" : c.value.split("_")[0]}</span>
                          {c.network && <span className="text-[9px] px-1 py-0.5 rounded bg-black/20">{c.network}</span>}
                        </button>
                      );
                    })
                  )}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Amount */}
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel className="text-xs uppercase tracking-wider font-bold">Amount (USD)</FormLabel>
                {selectedCurrency && maxForCoin > 0 && (
                  <span className="text-xs text-muted-foreground font-mono">
                    Max: <span className="text-primary font-bold">{formatCurrency(maxForCoin)}</span>
                    {hasCryptoBalances && coinData.cryptoAmounts[selectedCurrency] && (
                      <span className="text-muted-foreground/60 ml-1">
                        ({coinData.cryptoAmounts[selectedCurrency].amount.toFixed(6)} {selectedCurrency.split("_")[0]})
                      </span>
                    )}
                  </span>
                )}
              </div>
              <FormControl>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</div>
                  <Input
                    type="number"
                    step="0.01"
                    min="1"
                    max={maxForCoin > 0 ? maxForCoin : undefined}
                    className="pl-8 font-mono bg-secondary"
                    {...field}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 text-xs font-bold text-primary"
                    onClick={() => maxForCoin > 0 && form.setValue("amount", Math.floor(maxForCoin * 100) / 100)}
                    disabled={maxForCoin <= 0}
                  >
                    MAX
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Address */}
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs uppercase tracking-wider font-bold">
                {selectedCurrency ? `${selectedCurrency.split("_")[0]} Wallet Address` : "Wallet Address"}
              </FormLabel>
              <FormControl>
                <Input placeholder="Enter destination address" className="font-mono bg-secondary text-xs" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
          <p className="text-xs text-blue-400/80">
            <span className="font-bold">Note:</span> Withdrawal limits are based on your live crypto balance at current market prices.
            {hasCryptoBalances
              ? " Only coins you have deposited are available for withdrawal."
              : " Your balance will be converted to the selected coin at the time of withdrawal."}
          </p>
        </div>

        <Button
          type="submit"
          className="w-full font-bold uppercase tracking-widest h-12"
          disabled={requestWithdrawal.isPending || availableCurrencies.length === 0 || !selectedCurrency || liveTotal <= 0}
        >
          {requestWithdrawal.isPending
            ? "Submitting Request..."
            : (form.watch("amount") >= 10000 ? "Request Withdrawal" : "Instant Withdrawal")}
        </Button>
      </form>
    </Form>
  );
}
