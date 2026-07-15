import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Check, AlertCircle } from "lucide-react";
import { getApiUrl } from "@/lib/api-fetch";

interface VerifyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  betId: number;
  gameSlug: string;
  gameName: string;
}

export function VerifyModal({ open, onOpenChange, betId, gameSlug, gameName }: VerifyModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchVerification = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl(`/api/bets/verify/${betId}`));
      if (!res.ok) throw new Error("Failed to fetch verification data");
      const result = await res.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && !data) {
      fetchVerification();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>🔐 Verify {gameName}</span>
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {data && (
          <div className="space-y-4">
            {/* Verification Status */}
            <div className={`p-3 rounded-lg border ${
              data.verified
                ? "bg-green-500/10 border-green-500/30"
                : "bg-red-500/10 border-red-500/30"
            }`}>
              <p className={`text-sm font-bold ${data.verified ? "text-green-400" : "text-red-400"}`}>
                {data.verificationStatus}
              </p>
            </div>

            {/* Game Info */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Game:</span>
                <span className="font-mono font-bold">{data.game}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Result:</span>
                <span className="font-mono font-bold">{data.won ? "✅ Won" : "❌ Lost"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bet:</span>
                <span className="font-mono font-bold">${parseFloat(data.amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payout:</span>
                <span className="font-mono font-bold">${parseFloat(data.payout).toFixed(2)}</span>
              </div>
            </div>

            {/* Seeds and Nonce */}
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase">Server Seed Hash</label>
                <div className="flex items-center gap-2 p-2 rounded bg-secondary/50 border border-border/50">
                  <code className="text-xs font-mono flex-1 truncate">{data.serverSeedHash}</code>
                  <button
                    onClick={() => copyToClipboard(data.serverSeedHash, "serverSeedHash")}
                    className="p-1 hover:bg-secondary rounded transition-colors"
                  >
                    {copied === "serverSeedHash" ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase">Server Seed (Revealed)</label>
                <div className="flex items-center gap-2 p-2 rounded bg-secondary/50 border border-border/50">
                  <code className="text-xs font-mono flex-1 truncate">{data.serverSeed}</code>
                  <button
                    onClick={() => copyToClipboard(data.serverSeed, "serverSeed")}
                    className="p-1 hover:bg-secondary rounded transition-colors"
                  >
                    {copied === "serverSeed" ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase">Client Seed</label>
                <div className="flex items-center gap-2 p-2 rounded bg-secondary/50 border border-border/50">
                  <code className="text-xs font-mono flex-1 truncate">{data.clientSeed}</code>
                  <button
                    onClick={() => copyToClipboard(data.clientSeed, "clientSeed")}
                    className="p-1 hover:bg-secondary rounded transition-colors"
                  >
                    {copied === "clientSeed" ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase">Nonce</label>
                <div className="flex items-center gap-2 p-2 rounded bg-secondary/50 border border-border/50">
                  <code className="text-xs font-mono flex-1 truncate">{data.nonce}</code>
                  <button
                    onClick={() => copyToClipboard(data.nonce, "nonce")}
                    className="p-1 hover:bg-secondary rounded transition-colors"
                  >
                    {copied === "nonce" ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Verification Instructions */}
            <div className="space-y-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <p className="text-xs font-bold text-blue-400 uppercase">How to Verify</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                {data.verificationInstructions?.map((instruction: string, idx: number) => (
                  <li key={idx}>{instruction}</li>
                ))}
              </ol>
            </div>

            {/* Algorithm Info */}
            {data.provablyFairPhilosophy && (
              <div className="space-y-2 p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                <p className="text-xs font-bold text-purple-400 uppercase">Cryptographic Standard</p>
                <p className="text-xs text-muted-foreground">{data.provablyFairPhilosophy.standard}</p>
                <p className="text-xs text-muted-foreground">{data.provablyFairPhilosophy.whyWeUseIt}</p>
              </div>
            )}

            <Button onClick={() => onOpenChange(false)} className="w-full">
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
