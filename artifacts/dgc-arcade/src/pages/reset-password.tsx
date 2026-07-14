import { useState } from "react";
import { useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertTriangle, KeyRound } from "lucide-react";
import { getApiUrl } from "@/lib/api-fetch";

export default function ResetPasswordPage() {
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error" | null; msg: string }>({ type: null, msg: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { setStatus({ type: "error", msg: "Password must be at least 6 characters" }); return; }
    if (password !== confirm) { setStatus({ type: "error", msg: "Passwords do not match" }); return; }
    if (!token) { setStatus({ type: "error", msg: "Missing reset token — use the link from your email" }); return; }

    setLoading(true);
    setStatus({ type: null, msg: "" });

    try {
      const res = await fetch(getApiUrl("/api/auth/reset-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (res.ok) {
        setDone(true);
        setStatus({ type: "success", msg: "Password reset! You can now log in with your new password." });
      } else {
        setStatus({ type: "error", msg: data.error || "Reset failed. The link may have expired." });
      }
    } catch {
      setStatus({ type: "error", msg: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border/40 rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <KeyRound className="w-7 h-7 text-primary" />
          </div>
          <h1 className="font-display font-black text-2xl uppercase tracking-widest">Reset Password</h1>
          <p className="text-sm text-muted-foreground">Choose a new password for your DGC Arcade account.</p>
        </div>

        {!done ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-foreground">New Password</label>
              <Input
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-foreground">Confirm Password</label>
              <Input
                type="password"
                placeholder="Repeat your new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>

            {status.msg && (
              <div className={`rounded-lg p-3 flex items-center gap-2 text-xs ${
                status.type === "success"
                  ? "bg-green-500/10 border border-green-500/30 text-green-300"
                  : "bg-red-500/10 border border-red-500/30 text-red-300"
              }`}>
                {status.type === "success"
                  ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                  : <AlertTriangle className="w-4 h-4 shrink-0" />}
                {status.msg}
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full font-bold uppercase tracking-wider">
              {loading ? "Resetting..." : "Set New Password"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            {status.msg && (
              <div className="rounded-lg p-3 flex items-center gap-2 text-sm bg-green-500/10 border border-green-500/30 text-green-300">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                {status.msg}
              </div>
            )}
            <Button
              className="w-full font-bold uppercase tracking-wider"
              onClick={() => window.location.href = "/"}
            >
              Go to Login
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
