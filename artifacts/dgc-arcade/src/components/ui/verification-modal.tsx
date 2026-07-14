import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { getApiUrl } from "@/lib/api-fetch";

interface VerificationModalProps {
  open: boolean;
  onClose: () => void;
  /** When true, the modal cannot be dismissed — user must verify to continue */
  required?: boolean;
}

export function VerificationModal({ open, onClose, required = false }: VerificationModalProps) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error" | null; msg: string }>({ type: null, msg: "" });
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const hasSentInitial = useRef(false);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [resendCooldown]);

  // Reset state when modal opens/closes — do NOT auto-send (backend already sends on register)
  useEffect(() => {
    if (open && !hasSentInitial.current) {
      hasSentInitial.current = true;
      setStatus({ type: "success", msg: "✉️ Verification email sent! Check your inbox." });
    }
    if (!open) {
      hasSentInitial.current = false;
      setStatus({ type: null, msg: "" });
      setCode("");
    }
  }, [open]);

  const handleVerify = async () => {
    if (!code || code.length < 6) {
      setStatus({ type: "error", msg: "Please enter the complete 6-character code" });
      return;
    }

    setLoading(true);
    setStatus({ type: null, msg: "" });

    try {
      const token = typeof localStorage !== "undefined" ? localStorage.getItem("dgc_token") : null;
      const res = await fetch(getApiUrl("/api/users/me/verify/code"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token ?? ""}`
        },
        body: JSON.stringify({ code })
      });

      const data = await res.json();

      if (res.ok) {
        setStatus({ type: "success", msg: "✅ Email verified successfully!" });
        setCode("");
        // Invalidate user cache to refresh emailVerified status
        await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setTimeout(() => onClose(), 1500);
      } else {
        setStatus({ type: "error", msg: data.error || "Verification failed. Please try again." });
      }
    } catch (err) {
      setStatus({ type: "error", msg: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (isInitial = false) => {
    if (!isInitial) setResendLoading(true);
    else setStatus({ type: "success", msg: "✉️ Sending verification email..." });

    try {
      const token = typeof localStorage !== "undefined" ? localStorage.getItem("dgc_token") : null;
      const res = await fetch(getApiUrl("/api/users/me/verify/resend"), {
        method: "POST",
        headers: { "Authorization": `Bearer ${token ?? ""}` }
      });

      const data = await res.json();

      if (res.ok) {
        setStatus({ type: "success", msg: "✉️ Verification email sent! Check your inbox." });
        setResendCooldown(60);
        setCode("");
      } else {
        setStatus({ type: "error", msg: data.error || "Failed to send email" });
      }
    } catch (err) {
      setStatus({ type: "error", msg: "Network error. Please try again." });
    } finally {
      if (!isInitial) setResendLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={required ? undefined : onClose}>
      <DialogContent className="bg-card border-border/40 w-full max-w-md shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold uppercase tracking-wider">Verify Your Email</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {required && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-300 font-bold uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Email verification required to play
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Enter the 6-character code from your email to unlock all DGC Arcade features including withdrawals.
          </p>

          {/* OTP Input */}
          <div className="flex justify-center">
            <InputOTP maxLength={6} value={code} onChange={setCode}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          {/* Status Message */}
          {status.msg && (
            <div className={`rounded-lg p-3 flex items-center gap-2 text-xs ${
              status.type === "success"
                ? "bg-green-500/10 border border-green-500/30 text-green-300"
                : "bg-red-500/10 border border-red-500/30 text-red-300"
            }`}>
              {status.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              )}
              {status.msg}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleVerify}
              disabled={loading || code.length < 6}
              className="flex-1 font-bold uppercase tracking-wider"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Verify"}
            </Button>
            {!required && (
              <Button onClick={onClose} variant="outline" className="flex-1 font-bold uppercase tracking-wider">
                Cancel
              </Button>
            )}
          </div>

          {/* Resend Link */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-2">Didn't get the code?</p>
            <button
              onClick={() => handleResend(false)}
              disabled={resendLoading || resendCooldown > 0}
              className="text-xs text-primary hover:text-primary/80 font-bold uppercase disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {resendLoading ? (
                <span className="flex items-center gap-1 justify-center">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Sending...
                </span>
              ) : resendCooldown > 0 ? (
                `Resend in ${resendCooldown}s`
              ) : (
                "Resend Code"
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
