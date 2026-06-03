import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useInitiateDeposit } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const depositSchema = z.object({
  amount: z.coerce.number().min(1, "Minimum deposit is $1"),
  currency: z.string().min(1, "Please select a currency"),
});

const CURRENCIES = [
  { value: "BTC", label: "Bitcoin (BTC)" },
  { value: "ETH", label: "Ethereum (ETH)" },
  { value: "LTC", label: "Litecoin (LTC)" },
  { value: "USDT", label: "Tether (USDT)" },
  { value: "DOGE", label: "Dogecoin (DOGE)" },
];

export function DepositForm() {
  const { toast } = useToast();
  const initiateDeposit = useInitiateDeposit();
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);

  const form = useForm<z.infer<typeof depositSchema>>({
    resolver: zodResolver(depositSchema),
    defaultValues: {
      amount: 50,
      currency: "USDT",
    },
  });

  const onSubmit = (values: z.infer<typeof depositSchema>) => {
    initiateDeposit.mutate(
      { data: values },
      {
        onSuccess: (res) => {
          setPaymentUrl(res.paymentUrl);
          toast({
            title: "Deposit Initiated",
            description: "Please complete the payment in the new window.",
          });
          // Open in new tab
          window.open(res.paymentUrl, '_blank');
        },
        onError: (err) => {
          toast({
            title: "Deposit Failed",
            description: err.data?.error || "Could not initiate deposit",
            variant: "destructive",
          });
        }
      }
    );
  };

  if (paymentUrl) {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4 border border-primary">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round" className="text-primary"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        </div>
        <h3 className="font-display font-bold text-xl uppercase">Processing Deposit</h3>
        <p className="text-muted-foreground text-sm">
          Please complete your payment on the OxaPay page. Your balance will update automatically once confirmed.
        </p>
        <div className="pt-4 flex gap-4 justify-center">
          <Button onClick={() => window.open(paymentUrl, '_blank')} variant="outline">
            Re-open Payment Page
          </Button>
          <Button onClick={() => setPaymentUrl(null)}>
            Make Another Deposit
          </Button>
        </div>
      </div>
    );
  }

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
              <FormLabel className="text-xs uppercase tracking-wider font-bold">Deposit Currency</FormLabel>
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
        
        <Button 
          type="submit" 
          className="w-full font-bold uppercase tracking-widest h-12"
          disabled={initiateDeposit.isPending}
        >
          {initiateDeposit.isPending ? "Generating Invoice..." : "Proceed to Payment"}
        </Button>
      </form>
    </Form>
  );
}
