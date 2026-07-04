import { useCallback, useEffect, useState } from "react";
import { Shield, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = "dgc_owner_stepup_token";

export function getOwnerStepUpToken(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function ownerStepUpHeaders(): Record<string, string> {
  const token = getOwnerStepUpToken();
  return token ? { "X-Owner-Step-Up": token } : {};
}

interface OwnerStepUpGateProps {
  children: React.ReactNode;
}

/** Extra lock for fanodgc owner tools on profile — login stays open everywhere. */
export function OwnerStepUpGate({ children }: OwnerStepUpGateProps) {
  const { toast } = useToast();
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(true);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const authHeaders = useCallback(() => {
    const token = localStorage.getItem("dgc_token");
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...ownerStepUpHeaders(),
    };
  }, []);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const stored = getOwnerStepUpToken();
      const r = await fetch("/api/auth/owner/stepup/status", { headers: authHeaders() });
      const data = await r.json().catch(() => ({}));
      if (data.disabled || data.verified) {
        setVerified(true);
        return;
      }
      if (stored) setVerified(false);
    } catch {
      /* ignore */
    } finally {
      setChecking(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const sendCode = async () => {
    setSending(true);
    try {
      const r = await fetch("/api/auth/owner/stepup/send", {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (data.retryAfterSec) setCooldown(data.retryAfterSec);
        throw new Error(data.error || "Failed to send code");
      }
      setCooldown(45);
      toast({
        title: "Owner code sent",
        description: "Check your email for the 6-digit code.",
      });
    } catch (err: unknown) {
      toast({ title: "Could not send code", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async () => {
    if (code.length < 6) return;
    setVerifying(true);
    try {
      const r = await fetch("/api/auth/owner/stepup/verify", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ code }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Invalid code");
      localStorage.setItem(STORAGE_KEY, data.stepUpToken);
      setVerified(true);
      setCode("");
      toast({ title: "Owner tools unlocked", description: "Valid for 45 minutes on this device." });
    } catch (err: unknown) {
      toast({ title: "Verification failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  if (checking) {
    return (
      <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-8 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
      </div>
    );
  }

  if (verified) return <>{children}</>;

  return (
    <div className="rounded-xl border border-purple-500/40 bg-gradient-to-br from-purple-500/10 to-background p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
          <Shield className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h3 className="font-display font-black uppercase tracking-wider text-sm text-purple-300">
            Owner profile lock
          </h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            You can log in from anywhere anytime. This extra code only protects owner AI and bank controls on your profile.
          </p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          type="button"
          variant="outline"
          className="gap-2 shrink-0"
          onClick={sendCode}
          disabled={sending || cooldown > 0}
        >
          <Mail className="w-4 h-4" />
          {sending ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Send code"}
        </Button>
        <Input
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="6-digit code"
          inputMode="numeric"
          className="font-mono text-center tracking-[0.35em]"
        />
        <Button type="button" onClick={verifyCode} disabled={verifying || code.length < 6}>
          {verifying ? "…" : "Unlock"}
        </Button>
      </div>
    </div>
  );
}
