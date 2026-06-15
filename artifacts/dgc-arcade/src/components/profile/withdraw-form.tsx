import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRequestWithdrawal, getListTransactionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { CoinIcon, CURRENCIES } from "@/components/wallet/coin-icon";
import { formatCurrency } from "@/lib/format";

const withdrawSchema = z.object({
  amount: z.coerce.number().min(1, "Minimum withdrawal is $1"),
  currency: z.string().min(1, "Please select a currency"),
  address: z.string().min(10, "Please enter a valid wallet address"),
});

export function WithdrawForm() {
  const { toast } = useToast();
  const requestWithdrawal = useRequestWithdrawal();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isCreator = user?.withdrawalsEnabled === false;

  // Per-coin deposit balances — only coins the user has deposited in can be withdrawn
  const [coinBalances, setCoinBalances] = useState<Record<string, number>>({});
  const [coinBalancesLoading, setCoinBalancesLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("dgc_token");
    fetch("/api/transactions/coin-balances", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { if (d.balances) setCoinBalances(d.balances); })
      .catch(() => {})
      .finally(() => setCoinBalancesLoading(false));
  }, []);

  const availableCurrencies = CURRENCIES.filter(c => (coinBalances[c.value] ?? 0) > 0);
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
  const maxForCoin = Math.min(coinBalances[selectedCurrency] ?? 0, user?.balance ?? 0);

  const onSubmit = (values: z.infer<typeof withdrawSchema>) => {
    if (!user) return;
    if (values.amount > (user.balance ?? 0)) {
      form.setError("amount", { message: "Amount exceeds your balance" });
      return;
    }
    const coinMax = coinBalances[values.currency] ?? 0;
    if (coinMax > 0 && values.amount > coinMax) {
      form.setError("amount", {
        message: `Max ${formatCurrency(coinMax)} for ${values.currency} (your deposited amount in this coin)`,
      });
      return;
    }
    requestWithdrawal.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({ title: "Withdrawal Requested", description: "Your withdrawal is being processed." });
          form.reset({ amount: 1, currency: firstAvailable, address: "" });
          queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
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

        {/* Currency selector — only deposited coins selectable */}
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
                    <p className="text-xs text-muted-foreground italic">No completed deposits yet — deposit first to unlock withdrawals.</p>
                  ) : (
                    CURRENCIES.map(c => {
                      const deposited = coinBalances[c.value] ?? 0;
                      const isAvailable = deposited > 0;
                      return (
                        <button
                          key={c.value}
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => {
                            field.onChange(c.value);
                            // Reset amount to valid range for this coin
                            const currentAmt = form.getValues("amount");
                            const newMax = Math.min(deposited, user?.balance ?? 0);
                            if (currentAmt > newMax) form.setValue("amount", Math.max(1, newMax));
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                            !isAvailable
                              ? "border-border/20 bg-secondary/20 text-muted-foreground/30 opacity-40 cursor-not-allowed"
                              : field.value === c.value
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border/50 bg-secondary/40 text-muted-foreground hover:border-primary/40"
                          }`}
                          title={isAvailable ? `Deposited: ${formatCurrency(deposited)}` : "No deposits in this currency"}
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
                    <span className="text-muted-foreground/60 ml-1">(deposited {formatCurrency(coinBalances[selectedCurrency] ?? 0)} in {selectedCurrency.split("_")[0]})</span>
                  </span>
                )}
              </div>
              <FormControl>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</div>
                  <Input type="number" step="1" className="pl-8 font-mono bg-secondary" {...field} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 text-xs font-bold text-primary"
                    onClick={() => maxForCoin > 0 && form.setValue("amount", Math.floor(maxForCoin))}
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
            <span className="font-bold">Note:</span> You can only withdraw in the same crypto you deposited with.
            Coins you haven't deposited in are grayed out.
          </p>
        </div>

        <Button
          type="submit"
          className="w-full font-bold uppercase tracking-widest h-12"
          disabled={requestWithdrawal.isPending || availableCurrencies.length === 0 || !selectedCurrency}
        >
          {requestWithdrawal.isPending ? "Submitting Request..." : "Request Withdrawal"}
        </Button>
      </form>
    </Form>
  );
}
