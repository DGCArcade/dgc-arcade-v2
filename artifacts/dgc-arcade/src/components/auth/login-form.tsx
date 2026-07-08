import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin, getGetMeQueryKey, notifyAuthLogin } from "@workspace/api-client-react";
import { setAuthToken } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { flushPendingGeo } from "@/lib/geo-sync";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuthModal } from "@/hooks/use-auth-modal";
import { CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";

const loginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export function LoginForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const loginMutation = useLogin();
  const authModal = useAuthModal();
  const [, setLocation] = useLocation();

  // Forgot-password inline state
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotStatus, setForgotStatus] = useState<{ type: "success" | "error" | null; msg: string }>({ type: null, msg: "" });

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = (values: z.infer<typeof loginSchema>) => {
    loginMutation.mutate({ data: values }, {
      onSuccess: (result: any) => {
        setAuthToken(result.token);
        queryClient.setQueryData(getGetMeQueryKey(), result.user);
        notifyAuthLogin();
        void flushPendingGeo();
        toast({ title: "Welcome back", description: "You have successfully logged in." });
        authModal.close();
        if (result.user.role === "admin" || result.user.role === "owner" || result.user.username.toLowerCase() === (process.env.REACT_APP_OWNER_USERNAME || "owner")) {
          setLocation("/admin");
        }
      },
      onError: (error: any) => {
        toast({
          title: "Login failed",
          description: error.data?.error || "An unexpected error occurred",
          variant: "destructive"
        });
      }
    });
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) {
      setForgotStatus({ type: "error", msg: "Enter your username or email" });
      return;
    }
    setForgotLoading(true);
    setForgotStatus({ type: null, msg: "" });
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: forgotIdentifier.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setForgotStatus({ type: "success", msg: data.message || "Check your email for a reset link." });
      } else {
        setForgotStatus({ type: "error", msg: data.error || "Something went wrong. Try again." });
      }
    } catch {
      setForgotStatus({ type: "error", msg: "Network error. Please try again." });
    } finally {
      setForgotLoading(false);
    }
  };

  // ── Forgot password view ───────────────────────────────────────────────────
  if (forgotMode) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => { setForgotMode(false); setForgotStatus({ type: null, msg: "" }); setForgotIdentifier(""); }}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3 h-3" /> Back to login
        </button>

        <p className="text-sm text-muted-foreground">
          Enter your <strong className="text-foreground">username or email</strong> and we'll send a reset link to the address on your account.
        </p>

        <form onSubmit={handleForgotSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-semibold text-foreground">Username or Email</label>
            <Input
              placeholder="your_username or you@example.com"
              value={forgotIdentifier}
              onChange={(e) => setForgotIdentifier(e.target.value)}
              autoFocus
            />
          </div>

          {forgotStatus.msg && (
            <div className={`rounded-lg p-3 flex items-center gap-2 text-xs ${
              forgotStatus.type === "success"
                ? "bg-green-500/10 border border-green-500/30 text-green-300"
                : "bg-red-500/10 border border-red-500/30 text-red-300"
            }`}>
              {forgotStatus.type === "success"
                ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                : <AlertTriangle className="w-4 h-4 shrink-0" />}
              {forgotStatus.msg}
            </div>
          )}

          <Button
            type="submit"
            disabled={forgotLoading || forgotStatus.type === "success"}
            className="w-full font-bold uppercase tracking-wider"
          >
            {forgotLoading ? "Sending..." : "Send Reset Link"}
          </Button>
        </form>
      </div>
    );
  }

  // ── Normal login view ──────────────────────────────────────────────────────
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username or Email</FormLabel>
              <FormControl>
                <Input placeholder="Enter your username or email" {...field} />
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
              <div className="flex items-center justify-between">
                <FormLabel>Password</FormLabel>
                <button
                  type="button"
                  onClick={() => setForgotMode(true)}
                  className="text-xs text-primary hover:text-primary/80 font-semibold transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <FormControl>
                <Input type="password" placeholder="Enter your password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold uppercase tracking-wider"
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending ? "Logging in..." : "Log In"}
        </Button>
        <div className="text-center text-sm text-muted-foreground mt-4">
          Don't have an account?{" "}
          <button
            type="button"
            className="text-primary hover:underline font-bold"
            onClick={() => authModal.setView("register")}
          >
            Sign up
          </button>
        </div>
      </form>
    </Form>
  );
}
