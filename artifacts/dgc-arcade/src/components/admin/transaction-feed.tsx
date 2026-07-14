import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import {
  ArrowDownLeft, ArrowUpRight, ExternalLink, RefreshCw, Copy, Check,
  Filter, ChevronDown, ChevronUp
} from "lucide-react";
import { getApiUrl } from "@/lib/api-fetch";

function getToken() {
  return typeof localStorage !== "undefined" ? localStorage.getItem("dgc_token") : null;
}
function getBankSession() {
  return typeof sessionStorage !== "undefined" ? sessionStorage.getItem("dgcBankSession") : null;
}

async function bankFetch(path: string) {
  const token = getToken();
  const bankSession = getBankSession();
  const res = await fetch(getApiUrl(`/api/admin${path}`), {
    headers: {
      Authorization: `Bearer ${token ?? ""}`,
      ...(bankSession ? { "x-bank-session": bankSession } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

interface Transaction {
  id: number;
  userId: number;
  username: string;
  type: "deposit" | "withdrawal";
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "processing" | "needs_review";
  address?: string;
  txHash?: string;
  plisioTrackId?: string;
  orderId?: string;
  createdAt: string;
  // Enriched fields for deposits
  plisioReceivedCrypto?: number | null;
  plisioReceivedUsd?: number | null;
  plisioSourceUsd?: number | null;
}

interface TransactionFeedProps {
  autoRefreshInterval?: number;
}

const EXPLORER_URLS: Record<string, (hash: string) => string> = {
  BTC: (hash) => `https://www.blockchain.com/btc/tx/${hash}`,
  ETH: (hash) => `https://etherscan.io/tx/${hash}`,
  LTC: (hash) => `https://blockchair.com/litecoin/transaction/${hash}`,
  DOGE: (hash) => `https://blockchair.com/dogecoin/transaction/${hash}`,
  SOL: (hash) => `https://solscan.io/tx/${hash}`,
  BCH: (hash) => `https://blockchair.com/bitcoin-cash/transaction/${hash}`,
  TRX: (hash) => `https://tronscan.org/#/transaction/${hash}`,
  XMR: (hash) => `https://xmrchain.net/tx/${hash}`,
  DASH: (hash) => `https://blockchair.com/dash/transaction/${hash}`,
  TON: (hash) => `https://tonviewer.com/transaction/${hash}`,
};

export function TransactionFeed({ autoRefreshInterval = 30000 }: TransactionFeedProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "deposit" | "withdrawal">("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (filterType !== "all") query.append("type", filterType);
      if (filterStatus !== "all") query.append("status", filterStatus);
      query.append("limit", "50");

      const data = await bankFetch(`/transactions?${query.toString()}`);
      setTransactions(data.transactions ?? []);
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err?.message ?? "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus]);

  useEffect(() => {
    fetchTransactions();
    const interval = setInterval(fetchTransactions, autoRefreshInterval);
    return () => clearInterval(interval);
  }, [fetchTransactions, autoRefreshInterval]);

  const handleCopyId = (id: number) => {
    navigator.clipboard.writeText(String(id));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-600/20 text-green-400 border-green-500/30";
      case "pending":
      case "processing":
        return "bg-yellow-600/20 text-yellow-400 border-yellow-500/30";
      case "needs_review":
        return "bg-orange-600/20 text-orange-400 border-orange-500/30";
      case "failed":
        return "bg-red-600/20 text-red-400 border-red-500/30";
      default:
        return "bg-gray-600/20 text-gray-400 border-gray-500/30";
    }
  };

  const getExplorerUrl = (currency: string, hash: string) => {
    const urlBuilder = EXPLORER_URLS[currency];
    return urlBuilder ? urlBuilder(hash) : null;
  };

  const formatAmount = (amount: number) => {
    return amount >= 1000 ? formatCurrency(amount) : formatCurrency(amount);
  };

  const filteredTransactions = transactions.filter((t) => {
    if (filterType !== "all" && t.type !== filterType) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-primary" />
            Live Transaction Feed
          </h3>
          {lastRefresh && (
            <p className="text-xs text-muted-foreground font-mono">
              Refreshed {lastRefresh.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={fetchTransactions}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border hover:bg-secondary transition-colors text-xs font-bold disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Type:</span>
          {(["all", "deposit", "withdrawal"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-2 py-1 rounded text-xs font-bold uppercase transition-colors ${
                filterType === t
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              {t === "all" ? "All" : t === "deposit" ? "Deposits" : "Withdrawals"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Status:</span>
          {(["all", "completed", "pending", "failed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-2 py-1 rounded text-xs font-bold uppercase transition-colors ${
                filterStatus === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs font-mono">
          {error}
        </div>
      )}

      {/* Transactions List */}
      <div className="space-y-2">
        {filteredTransactions.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="p-6 text-center">
              <p className="text-xs text-muted-foreground font-mono">No transactions found</p>
            </CardContent>
          </Card>
        ) : (
          filteredTransactions.map((tx) => {
            const isExpanded = expandedId === tx.id;
            const isCopied = copiedId === tx.id;
            const explorerUrl = tx.txHash ? getExplorerUrl(tx.currency, tx.txHash) : null;

            return (
              <Card
                key={tx.id}
                className="bg-card border-border hover:border-border/80 transition-colors cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : tx.id)}
              >
                <CardContent className="p-4">
                  {/* Main Row */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Icon */}
                      <div className="flex-shrink-0">
                        {tx.type === "deposit" ? (
                          <ArrowDownLeft className="w-5 h-5 text-blue-400" />
                        ) : (
                          <ArrowUpRight className="w-5 h-5 text-amber-400" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-white">@{tx.username}</span>
                          <Badge className={`text-xs border ${getStatusColor(tx.status)}`}>
                            {tx.status}
                          </Badge>
                          <span className="text-xs font-mono text-muted-foreground">
                            ID: {tx.id}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono mt-1">
                          {new Date(tx.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="text-right flex-shrink-0">
                      <p className="font-mono font-black text-base text-white">
                        {formatAmount(tx.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {tx.currency}
                      </p>
                    </div>

                    {/* Expand */}
                    <div className="flex-shrink-0">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-border/30 space-y-3">
                      {/* ID with Copy */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                          Transaction ID
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-white">{tx.id}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyId(tx.id);
                            }}
                            className="p-1 hover:bg-secondary rounded transition-colors"
                          >
                            {isCopied ? (
                              <Check className="w-4 h-4 text-green-400" />
                            ) : (
                              <Copy className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Address */}
                      {tx.address && (
                        <div>
                          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            {tx.type === "deposit" ? "From" : "To"} Address
                          </span>
                          <p className="font-mono text-xs text-white break-all mt-1">
                            {tx.address}
                          </p>
                        </div>
                      )}

                      {/* Blockchain Link */}
                      {tx.txHash && explorerUrl && (
                        <div>
                          <a
                            href={explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-primary/50 hover:bg-primary/10 transition-colors text-xs font-bold text-primary"
                          >
                            View on {tx.currency} Explorer
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}

                      {/* Deposit Enrichment */}
                      {tx.type === "deposit" && (
                        <>
                          {tx.plisioSourceUsd !== undefined && (
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Invoice Amount:</span>
                              <span className="font-mono text-white">
                                ${tx.plisioSourceUsd?.toFixed(2)}
                              </span>
                            </div>
                          )}
                          {tx.plisioReceivedUsd !== undefined && (
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Received (USD):</span>
                              <span className="font-mono text-green-400">
                                ${tx.plisioReceivedUsd?.toFixed(2)}
                              </span>
                            </div>
                          )}
                          {tx.plisioReceivedCrypto !== undefined && (
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Received ({tx.currency}):</span>
                              <span className="font-mono text-green-400">
                                {tx.plisioReceivedCrypto?.toFixed(8)}
                              </span>
                            </div>
                          )}
                        </>
                      )}

                      {/* Plisio Track ID */}
                      {tx.plisioTrackId && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">Plisio Track ID:</span>
                          <p className="font-mono text-white mt-1 break-all">{tx.plisioTrackId}</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Summary */}
      <div className="text-xs text-muted-foreground font-mono text-center">
        Showing {filteredTransactions.length} of {transactions.length} transactions
      </div>
    </div>
  );
}

// Import icon at top
import { Activity } from "lucide-react";
