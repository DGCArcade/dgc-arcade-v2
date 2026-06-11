import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRequestWithdrawal, getListTransactionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";

const withdrawSchema = z.object({
  amount: z.coerce.number().min(10, "Minimum withdrawal is $10"),
  currency: z.string().min(1, "Please select a currency"),
  address: z.string().min(10, "Please enter a valid wallet address"),
});

const CURRENCIES = [
  { value: "BTC",      label: "₿ Bitcoin (BTC)" },
  { value: "ETH",      label: "Ξ Ethereum (ETH)" },
  { value: "LTC",      label: "Ł Litecoin (LTC)" },
  { value: "USDT_TRX", label: "₮ Tether USDT · TRC-20" },
  { value: "USDT_TON", label: "₮ Tether USDT · TON" },
  { value: "SOL",      label: "◎ Solana (SOL)" },
  { value: "DOGE",     label: "Ð Dogecoin (DOGE)" },
  { value: "TRX",      label: "⚡ Tron (TRX)" },
  { value: "TON",      label: "💎 Toncoin (TON)" },
  { value: "BCH",      label: "Ƀ Bitcoin Cash (BCH)" },
  { value: "XMR",      label: "ɱ Monero (XMR)" },
  { value: "DASH",     label: "D Dash (DASH)" },
];

export function WithdrawForm() {
  const { toast } = useToast();
  const requestWithdrawal = useRequestWithdrawal();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const form = useForm<z.infer<typeof withdrawSchema>>({
    resolver: zodResolver(withdrawSchema),
    defaultValues: {
      amount: 10,
      currency: "USDT_TRX",
      address: "",
    },
  });

  const onSubmit = (values: z.infer<typeof withdrawSchema>) => {
    if (user && values.amount > user.balance) {
      form.setError("amount", { message: "Amount exceeds your balance" });
      return;
    }

    requestWithdrawal.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({
            title: "Withdrawal Requested",
            description: "Your withdrawal is now under review.",
          });
          form.reset();
          queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        },
        onError: (err) => {
          toast({
            title: "Withdrawal Failed",
            description: err.data?.error || "Could not request withdrawal",
            variant: "destructive",
          });
        }
      }
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs uppercase tracking-wider font-bold">Amount (USD)</FormLabel>
              <FormControl>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</div>
                  <Input type="number" step="1" className="pl-8 font-mono bg-secondary" {...field} />
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 text-xs font-bold"
                    onClick={() => user && form.setValue("amount", user.balance)}
                  >
                    MAX
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="currency"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs uppercase tracking-wider font-bold">Receive Currency</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="bg-secondary font-mono">
                    <SelectValue placeholder="Select a currency" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {CURRENCIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                <Input placeholder="Enter destination address" className="font-mono bg-secondary text-xs" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <Button 
          type="submit" 
          className="w-full font-bold uppercase tracking-widest h-12"
          disabled={requestWithdrawal.isPending}
        >
          {requestWithdrawal.isPending ? "Submitting Request..." : "Request Withdrawal"}
        </Button>
      </form>
    </Form>
  );
}
