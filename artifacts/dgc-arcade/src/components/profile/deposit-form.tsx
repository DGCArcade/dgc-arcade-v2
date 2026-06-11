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
  { value: "BTC",      label: "Bitcoin (BTC)" },
  { value: "ETH",      label: "Ethereum (ETH)" },
  { value: "LTC",      label: "Litecoin (LTC)" },
  { value: "USDT_TRX", label: "Tether USDT (TRC-20)" },
  { value: "USDT_TON", label: "Tether USDT (TON)" },
  { value: "SOL",      label: "Solana (SOL)" },
  { value: "DOGE",     label: "Dogecoin (DOGE)" },
  { value: "TRX",      label: "Tron (TRX)" },
  { value: "TON",      label: "Toncoin (TON)" },
  { value: "BCH",      label: "Bitcoin Cash (BCH)" },
  { value: "XMR",      label: "Monero (XMR)" },
  { value: "DASH",     label: "Dash (DASH)" },
];
export function DepositForm() {
  const { toast } = useToast();
  const initiateDeposit = useInitiateDeposit();
  const [depositResult, setDepositResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<z.infer<typeof depositSchema>>({
    resolver: zodResolver(depositSchema),
    defaultValues: { amount: 50, currency: "USDT_TRX" },
  });

  const copyAddress = () => {
    if (depositResult?.address) {
      navigator.clipboard.writeText(depositResult.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const onSubmit = (values: z.infer<typeof depositSchema>) => {
    initiateDeposit.mutate({ data: values } as any, {
      onSuccess: (res: any) => {
        setDepositResult(res);
        toast({
          title: "Deposit Address Generated",
          description: "Send crypto to the address below. Balance updates automatically.",
        });
      },
      onError: (err: any) => {
        toast({
          title: "Deposit Failed",
          description: err?.data?.error || "Could not initiate deposit",
          variant: "destructive",
        });
      },
    });
  };
  if (depositResult) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h3 className="font-bold text-lg uppercase tracking-wider mb-1">Send Payment</h3>
          <p className="text-muted-foreground text-xs">
            Send the exact crypto amount to the address below. Your balance updates automatically once confirmed on the blockchain.
          </p>
        </div>
        {depositResult.qrCode && (
          <div className="flex justify-center">
            <img src={depositResult.qrCode} alt="QR Code" className="w-48 h-48 rounded-lg border border-border" />
          </div>
        )}
        <div className="bg-secondary rounded-lg p-3 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Deposit Address</p>
          <p className="font-mono text-xs break-all text-foreground">{depositResult.address}</p>
          <Button variant="outline" size="sm" className="w-full mt-2" onClick={copyAddress}>
            {copied ? "Copied!" : "Copy Address"}
          </Button>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
          <p className="text-yellow-400 text-xs font-bold uppercase tracking-wider mb-1">Important</p>
          <p className="text-xs text-muted-foreground">
            Only send the selected cryptocurrency to this address. Sending the wrong coin will result in permanent loss.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => window.open(depositResult.paymentUrl, "_blank")}>
            View Invoice
          </Button>
          <Button className="flex-1" onClick={() => setDepositResult(null)}>
            New Deposit
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
              <div className="flex gap-2 mt-2">
                {[10, 25, 50, 100, 500].map((amt) => (
                  <button key={amt} type="button" onClick={() => form.setValue("amount", amt)} className="flex-1 text-xs py-1 rounded bg-secondary border border-border font-mono">
                    ${amt}
                  </button>
                ))}
              </div>
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
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full font-bold uppercase tracking-widest h-12" disabled={initiateDeposit.isPending}>
          {initiateDeposit.isPending ? "Generating Address..." : "Generate Deposit Address"}
        </Button>
      </form>
    </Form>
  );
}
