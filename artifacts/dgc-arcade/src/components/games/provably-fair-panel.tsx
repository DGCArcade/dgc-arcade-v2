import { useState } from "react";
import { ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";

interface ProvablyFairPanelProps {
  betId?: number | null;
  serverSeedHash?: string | null;
  serverSeed?: string | null;
  clientSeed?: string | null;
  nonce?: number | null;
  verifyPath?: string;
  /** compact = small verify chip; inline = one-line under track */
  variant?: "full" | "compact" | "inline";
  gameName?: string;
}

export function ProvablyFairPanel({
  betId,
  serverSeedHash,
  serverSeed,
  clientSeed,
  nonce,
  verifyPath,
  variant = "full",
  gameName = "this game",
}: ProvablyFairPanelProps) {
  const [open, setOpen] = useState(false);
  if (!serverSeedHash && !betId) return null;
  const href = verifyPath ?? (betId ? `/api/bets/verify/${betId}` : undefined);

  if (variant === "inline") {
    return (
      <div className="flex items-center justify-between gap-2 text-[9px] font-mono text-muted-foreground">
        <span className="flex items-center gap-1 truncate">
          <ShieldCheck className="w-3 h-3 text-primary shrink-0" />
          <span className="truncate">SHA-256 {serverSeedHash?.slice(0, 12)}…</span>
        </span>
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary font-bold uppercase shrink-0 hover:underline">
            Verify
          </a>
        )}
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className="rounded-md border border-border/40 bg-secondary/30 overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-secondary/50 transition-colors"
        >
          <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="w-3 h-3 text-primary" />
            Provably Fair
          </span>
          <span className="flex items-center gap-1 text-[9px] text-primary font-bold">
            {open ? "Hide" : "Details"}
            {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </span>
        </button>
        {open && (
          <div className="px-2 pb-2 pt-0 space-y-1.5 text-[9px] font-mono border-t border-border/30">
            {serverSeedHash && (
              <div>
                <span className="text-muted-foreground">Hash </span>
                <span className="break-all text-foreground/80">{serverSeedHash}</span>
              </div>
            )}
            {serverSeed && (
              <div>
                <span className="text-muted-foreground">Seed </span>
                <span className="break-all text-green-400/90">{serverSeed}</span>
              </div>
            )}
            {(clientSeed || nonce != null) && (
              <div className="flex flex-wrap gap-x-3 text-muted-foreground">
                {clientSeed && <span>Client: {clientSeed.slice(0, 16)}…</span>}
                {nonce != null && <span>Nonce: {nonce}</span>}
              </div>
            )}
            {href && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <a href={href} target="_blank" rel="noopener noreferrer" className="inline-block text-primary hover:underline font-bold uppercase">
                  Verify result →
                </a>
                {href.includes("chicken-road") && (
                  <a href="/chicken-road-verify.html" target="_blank" rel="noopener noreferrer" className="inline-block text-muted-foreground hover:text-primary hover:underline font-bold uppercase">
                    Open verifier
                  </a>
                )}
              </div>
            )}
          </div>
        )}
        {!open && href && (
          <div className="px-2 pb-1.5">
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[9px] text-primary font-bold uppercase hover:underline">
              Verify SHA-256 →
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 bg-secondary/40 p-3 space-y-2 text-xs font-mono">
      <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
        Provably Fair · SHA-256
      </div>
      <p className="text-[9px] text-muted-foreground leading-relaxed">
        SHA-256 commit is published before play. After {gameName}, verify the revealed seed matches the hash and reproduces death placement.
      </p>
      {serverSeedHash && (
        <div>
          <span className="text-muted-foreground">Hash </span>
          <span className="break-all text-foreground/80">{serverSeedHash}</span>
        </div>
      )}
      {serverSeed && (
        <div>
          <span className="text-muted-foreground">Seed </span>
          <span className="break-all text-green-400/90">{serverSeed}</span>
        </div>
      )}
      {(clientSeed || nonce != null) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          {clientSeed && <span>Client: <span className="text-foreground/70">{clientSeed}</span></span>}
          {nonce != null && <span>Nonce: <span className="text-foreground/70">{nonce}</span></span>}
        </div>
      )}
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="inline-block text-primary hover:underline font-bold uppercase tracking-wider text-[10px]">
          Verify result →
        </a>
      )}
    </div>
  );
}
