interface ProvablyFairPanelProps {
  betId?: number | null;
  serverSeedHash?: string | null;
  serverSeed?: string | null;
  clientSeed?: string | null;
  nonce?: number | null;
  verifyPath?: string;
}

export function ProvablyFairPanel({
  betId,
  serverSeedHash,
  serverSeed,
  clientSeed,
  nonce,
  verifyPath,
}: ProvablyFairPanelProps) {
  if (!serverSeedHash && !betId) return null;
  const href = verifyPath ?? (betId ? `/api/bets/verify/${betId}` : undefined);

  return (
    <div className="rounded-lg border border-border/50 bg-secondary/40 p-3 space-y-2 text-xs font-mono">
      <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Provably Fair · SHA-256</div>
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
