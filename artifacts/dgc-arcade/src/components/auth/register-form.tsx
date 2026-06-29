import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRegister, getGetMeQueryKey } from "@workspace/api-client-react";
import { setAuthToken } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { flushPendingGeo } from "@/lib/geo-sync";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuthModal } from "@/hooks/use-auth-modal";

// Generate a stable device fingerprint from browser properties
function getDeviceFingerprint(): string {
  const key = "dgc_dfp";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const raw = [
    navigator.userAgent,
    navigator.language,
    screen.width + "x" + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency ?? "",
    navigator.platform ?? "",
  ].join("|");
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (Math.imul(31, hash) + raw.charCodeAt(i)) | 0;
  }
  const fp = Math.abs(hash).toString(36) + Date.now().toString(36);
  localStorage.setItem(key, fp);
  return fp;
}

const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(24, "Username must be max 24 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  promoCode: z.string().optional().or(z.literal("")),
});

export function RegisterForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const registerMutation = useRegister();
  const authModal = useAuthModal();

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      promoCode: "",
    },
  });

  // Extract referral code and promo code from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      localStorage.setItem("dgc_referral", ref);
    }
    const promo = params.get("promo");
    if (promo) {
      form.setValue("promoCode", promo);
    }
  }, [form]);

  const onSubmit = async (values: z.infer<typeof registerSchema>) => {
    try {
      const fp = getDeviceFingerprint();
      const referralCode = localStorage.getItem("dgc_referral") || values.promoCode;
      const apiUrl = (import.meta.env.VITE_API_URL ?? "") + "/api/auth/register";
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-device-fingerprint": fp },
        body: JSON.stringify({ ...values, referralCode }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast({ title: "Registration failed", description: result.error || "An unexpected error occurred", variant: "destructive" });
        return;
      }
      setAuthToken(result.token);
      queryClient.setQueryData(getGetMeQueryKey(), result.user);
      void flushPendingGeo();
      authModal.close();
      // Auto-open email verification modal immediately after signup
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("openVerificationModal"));
      }, 150);
    } catch {
      toast({ title: "Registration failed", description: "Network error. Please try again.", variant: "destructive" });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="Choose a username" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="your@email.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="Choose a password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="promoCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Promo / Referral Code (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="Enter code" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button 
          type="submit" 
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold uppercase tracking-wider" 
          disabled={registerMutation.isPending}
        >
          {registerMutation.isPending ? "Creating account..." : "Sign Up Free"}
        </Button>
        <div className="text-center text-sm text-muted-foreground mt-4">
          Already have an account?{" "}
          <button 
            type="button" 
            className="text-primary hover:underline font-bold" 
            onClick={() => authModal.setView("login")}
          >
            Log in
          </button>
        </div>
      </form>
    </Form>
  );
}
