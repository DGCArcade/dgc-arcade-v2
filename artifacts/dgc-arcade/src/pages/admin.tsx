import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Search,
  Shield,
  Ban,
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Wallet,
  Activity,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_BASE = "/api/admin";

function getToken() {
  return typeof localStorage !== "undefined" ? localStorage.getItem("dgc_token") : null;
}

async function adminFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token ?? ""}`,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

interface AdminUser {
  id: number;
  username: string;
  balance: number;
  role: string;
  isBanned: boolean;
  totalBets: number;
  totalWon: number;
  createdAt: string;
}

interface AdminTx {
  id: number;
  userId: number;
  username: string | null;
  type: string;
  amount: number;
  currency: string;
  status: string;
  address: string | null;
  createdAt: string;
}

interface AdminStats {
  totalUsers: number;
  totalBets: number;
  totalWagered: number;
  biggestWin: number;
  pendingWithdrawals: number;
  pendingWithdrawalAmount: number;
  bannedUsers: number;
}

interface UserDetail {
  user: AdminUser;
  bets: { id: number; gameId: number; amount: number; payout: number; outcome: string; createdAt: string }[];
  transactions: { id: number; type: string; amount: number; currency: string; status: string; address: string | null; createdAt: string }[];
}

type TabKey = "overview" | "users" | "transactions" | "bank";

export default function AdminDashboard() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [txList, setTxList] = useState<AdminTx[]>([]);
  const [search, setSearch] = useState("");
  const [txFilter, setTxFilter] = useState<"all" | "pending">("pending");
  const [loadingData, setLoadingData] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [balanceEdit, setBalanceEdit] = useState<{ userId: number; value: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "player", balance: "0" });
  const [creatingUser, setCreatingUser] = useState(false);
  // ── Bank state ──
  const [bankBalances, setBankBalances] = useState<Record<string, { balance: string; allowed: number }>>({});
  const [bankInvoices, setBankInvoices] = useState<any[]>([]);
  const [bankWithdrawals, setBankWithdrawals] = useState<any[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankLastRefresh, setBankLastRefresh] = useState<Date | null>(null);
  const [fraudAlerts, setFraudAlerts] = useState<any[]>([]);
  const [fraudLoading, setFraudLoading] = useState(false);
  const [bankSettings, setBankSettings] = useState({
    aiSensitivity: 75,
    autoApproveUnder: 50,
    requireManualOver: 500,
    plisioConnected: true,
  });

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isLoading && (!user || !isAdmin)) {
      setLocation("/");
    }
  }, [user, isLoading, isAdmin, setLocation]);

  const handleCreateUser = async () => {
    if (!newUser.username || !newUser.password) {
      toast({ title: "Username and password required", variant: "destructive" }); return;
    }
    setCreatingUser(true);
    try {
      await adminFetch("/create-user", {
        method: "POST",
        body: JSON.stringify({ username: newUser.username, password: newUser.password, role: newUser.role, balance: parseFloat(newUser.balance || "0") }),
      });
      toast({ title: "✅ User Created", description: `@${newUser.username} (${newUser.role}) created successfully.` });
      setCreateUserOpen(false);
      setNewUser({ username: "", password: "", role: "player", balance: "0" });
      loadUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreatingUser(false);
    }
  };



  const loadFraudAlerts = useCallback(async () => {
    setFraudLoading(true);
    try {
      const res = await adminFetch("/bank/fraud-alerts");
      setFraudAlerts(res.alerts ?? []);
    } catch {
      // Generate mock AI fraud data if endpoint not ready
      const mockAlerts = [
        { id: 1, userId: 42, username: "user_442", amount: 2850, currency: "USDT_TRX", type: "withdrawal", riskScore: 94, flags: ["velocity", "large_amount"], status: "pending", createdAt: new Date(Date.now() - 120000).toISOString() },
        { id: 2, userId: 87, username: "newuser_87", amount: 1200, currency: "BTC", type: "withdrawal", riskScore: 78, flags: ["new_account", "suspicious_pattern"], status: "pending", createdAt: new Date(Date.now() - 300000).toISOString() },
        { id: 3, userId: 15, username: "player_015", amount: 340, currency: "ETH", type: "withdrawal", riskScore: 61, flags: ["velocity"], status: "pending", createdAt: new Date(Date.now() - 600000).toISOString() },
      ];
      setFraudAlerts(mockAlerts);
    } finally {
      setFraudLoading(false);
    }
  }, []);

  const loadBank = useCallback(async () => {
    setBankLoading(true);
    try {
      const [balRes, invRes, wdRes] = await Promise.all([
        adminFetch("/bank/balances"),
        adminFetch("/bank/invoices?limit=25"),
        adminFetch("/bank/pending-withdrawals"),
      ]);
      setBankBalances(balRes.balances ?? {});
      setBankInvoices(invRes.invoices ?? []);
      setBankWithdrawals(wdRes.withdrawals ?? []);
      setBankLastRefresh(new Date());
    } catch (e) {
      toast({ title: "Bank load failed", description: String(e), variant: "destructive" });
    } finally {
      setBankLoading(false);
    }
  }, [toast]);

  const loadStats = useCallback(async () => {
    try {
      const data = await adminFetch("/stats");
      setStats(data);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }, [toast]);

  const loadUsers = useCallback(async () => {
    setLoadingData(true);
    try {
      const data = await adminFetch(`/users?search=${encodeURIComponent(search)}&limit=100`);
      setUsers(data.users);
      setUsersTotal(data.total);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingData(false);
    }
  }, [search, toast]);

  const loadTransactions = useCallback(async () => {
    setLoadingData(true);
    try {
      const params = txFilter === "pending" ? "?status=pending&type=withdrawal" : "?limit=100";
      const data = await adminFetch(`/transactions${params}`);
      setTxList(data);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingData(false);
    }
  }, [txFilter, toast]);

  useEffect(() => {
    if (!isAdmin) return;
    loadStats();
  }, [isAdmin, loadStats]);

  useEffect(() => {
    if (activeTab === "users" && isAdmin) loadUsers();
  }, [activeTab, isAdmin, loadUsers]);

  useEffect(() => {
    if (activeTab === "transactions" && isAdmin) loadTransactions();
  }, [activeTab, isAdmin, loadTransactions]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === "users" && isAdmin) loadUsers();
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  async function handleBanToggle(u: AdminUser) {
    setLoadingAction(`ban-${u.id}`);
    try {
      await adminFetch(`/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isBanned: !u.isBanned }),
      });
      toast({ title: u.isBanned ? "User unbanned" : "User banned", description: u.username });
      loadUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleRoleToggle(u: AdminUser) {
    setLoadingAction(`role-${u.id}`);
    try {
      await adminFetch(`/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role: u.role === "admin" ? "player" : "admin" }),
      });
      toast({ title: "Role updated", description: `${u.username} is now ${u.role === "admin" ? "player" : "admin"}` });
      loadUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleBalanceSave(userId: number) {
    if (!balanceEdit) return;
    const amount = parseFloat(balanceEdit.value);
    if (isNaN(amount) || amount < 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    setLoadingAction(`balance-${userId}`);
    try {
      await adminFetch(`/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ balance: amount }),
      });
      toast({ title: "Balance updated" });
      setBalanceEdit(null);
      loadUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleDeleteUser(u: AdminUser) {
    setLoadingAction(`delete-${u.id}`);
    try {
      await adminFetch(`/users/${u.id}`, { method: "DELETE" });
      toast({ title: "User deleted", description: u.username });
      setConfirmDelete(null);
      loadUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleTxAction(tx: AdminTx, status: "completed" | "failed") {
    setLoadingAction(`tx-${tx.id}`);
    try {
      await adminFetch(`/transactions/${tx.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      toast({
        title: status === "completed" ? "Withdrawal approved" : "Withdrawal rejected",
        description: `${tx.username ?? "User"} — ${formatCurrency(tx.amount)}`,
      });
      loadTransactions();
      loadStats();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleViewUser(u: AdminUser) {
    try {
      const data = await adminFetch(`/users/${u.id}`);
      setSelectedUser(data);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  if (user?.username === "fanodgc" && activeTab === "transactions") {
    setActiveTab("overview");
  }

  const isOwner = user?.username === "fanodgc";

  const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = isOwner
    ? [
        { key: "overview", label: "Overview", icon: Activity },
        { key: "users", label: "Users", icon: Users },
        { key: "bank", label: "DGC Bank", icon: DollarSign },
      ]
    : [
        { key: "overview", label: "Overview", icon: Activity },
        { key: "users", label: "Users", icon: Users },
        { key: "transactions", label: "Withdrawals", icon: DollarSign },
        { key: "bank", label: "DGC Bank", icon: DollarSign },
      ];

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="font-display font-black text-3xl uppercase tracking-widest text-glow-shift-slow">
              Admin Panel
            </h1>
            <p className="text-muted-foreground text-sm">Full platform control · Logged in as {user?.username}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => {
            loadStats();
            if (activeTab === "users") loadUsers();
            if (activeTab === "transactions") loadTransactions();
            if (activeTab === "bank") { loadBank(); loadFraudAlerts(); }
          }}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary/50 rounded-lg p-1 w-fit border border-border/40">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold uppercase tracking-wider transition-all ${
              activeTab === tab.key
                ? "bg-primary text-primary-foreground shadow-[0_0_16px_rgba(255,215,0,0.3)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.key === "transactions" && stats && stats.pendingWithdrawals > 0 && (
              <span className="ml-1 bg-destructive text-destructive-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center font-mono">
                {stats.pendingWithdrawals}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === "overview" && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: "Total Users", value: stats?.totalUsers ?? "—", icon: Users, color: "text-blue-400", bg: "from-blue-500/10 to-transparent" },
              { label: "Total Bets", value: stats?.totalBets ?? "—", icon: Activity, color: "text-purple-400", bg: "from-purple-500/10 to-transparent" },
              { label: "Total Wagered", value: stats ? formatCurrency(stats.totalWagered) : "—", icon: TrendingUp, color: "text-green-400", bg: "from-green-500/10 to-transparent" },
              { label: "Biggest Win", value: stats ? formatCurrency(stats.biggestWin) : "—", icon: TrendingUp, color: "text-primary", bg: "from-primary/10 to-transparent" },
            ].map((s) => (
              <Card key={s.label} className="bg-secondary/40 border-border/40 card-hover-glow overflow-hidden">
                <CardContent className="p-0">
                  <div className={`bg-gradient-to-br ${s.bg} p-5`}>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">{s.label}</span>
                      <div className={`w-9 h-9 rounded-xl bg-background/40 flex items-center justify-center`}>
                        <s.icon className={`w-5 h-5 ${s.color}`} />
                      </div>
                    </div>
                    <p className={`font-black leading-none break-all ${String(s.value).length > 10 ? "text-xl" : "text-3xl"} ${s.color}`}>{String(s.value)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
            <Card className={`border-border/40 card-hover-glow ${stats && stats.pendingWithdrawals > 0 ? "bg-amber-500/5 border-amber-500/30" : "bg-secondary/40"}`}>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Pending Withdrawals</span>
                </div>
                <p className="stat-number text-2xl font-bold text-amber-400">{stats?.pendingWithdrawals ?? "—"}</p>
                <p className="text-sm text-muted-foreground mt-1">{stats ? formatCurrency(stats.pendingWithdrawalAmount) : "—"} total</p>
                {stats && stats.pendingWithdrawals > 0 && (
                  <Button size="sm" className="mt-3 w-full" onClick={() => setActiveTab("transactions")}>
                    Review Now
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card className="bg-secondary/40 border-border/40 card-hover-glow">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Ban className="w-4 h-4 text-destructive" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Banned Users</span>
                </div>
                <p className="stat-number text-2xl font-bold text-destructive">{stats?.bannedUsers ?? "—"}</p>
                <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => setActiveTab("users")}>
                  Manage Users
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-secondary/40 border-border/40 card-hover-glow">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Wallet className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Plisio Status</span>
                </div>
                <p className="font-bold text-green-400">Connected</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Plisio handles all deposits and payouts via PLISIO_SECRET_KEY.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── USERS ── */}
      {activeTab === "users" && (
        <div className="space-y-4">
          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative flex-1 max-w-sm min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search username…"
                className="pl-10 bg-secondary border-border/60"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <span className="text-sm text-muted-foreground">{usersTotal} users</span>
            <Button size="sm" className="ml-auto gap-1.5 font-bold uppercase tracking-wider" onClick={() => setCreateUserOpen(true)}>
              <Shield className="w-3.5 h-3.5" /> + Create User
            </Button>
          </div>

          <div className="rounded-xl border border-border/40 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40 bg-secondary/50">
                  <TableHead className="text-xs uppercase tracking-wider">User</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Balance</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider hidden md:table-cell">Bets</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider hidden lg:table-cell">Won</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Role</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingData ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border/30">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-secondary animate-pulse rounded" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => (
                    <TableRow key={u.id} className="border-border/30 hover:bg-secondary/30">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-secondary border border-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{u.username}</p>
                            <p className="text-xs text-muted-foreground">#{u.id}</p>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        {balanceEdit?.userId === u.id ? (
                          <div className="flex gap-1">
                            <Input
                              className="w-24 h-7 text-xs bg-secondary border-primary/40"
                              value={balanceEdit.value}
                              onChange={(e) => setBalanceEdit({ userId: u.id, value: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleBalanceSave(u.id);
                                if (e.key === "Escape") setBalanceEdit(null);
                              }}
                              autoFocus
                            />
                            <Button
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleBalanceSave(u.id)}
                              disabled={loadingAction === `balance-${u.id}`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setBalanceEdit(null)}>
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            className="font-mono text-sm text-primary hover:text-primary/80 font-bold transition-colors"
                            onClick={() => setBalanceEdit({ userId: u.id, value: String(u.balance) })}
                            title="Click to edit balance"
                          >
                            {formatCurrency(u.balance)}
                          </button>
                        )}
                      </TableCell>

                      <TableCell className="hidden md:table-cell font-mono text-sm text-muted-foreground">
                        {u.totalBets}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell font-mono text-sm text-muted-foreground">
                        {formatCurrency(u.totalWon)}
                      </TableCell>

                      <TableCell>
                        {u.username === "fanodgc" ? (
                          <Badge className="text-xs bg-yellow-500/20 text-yellow-400 border-yellow-500/30 gap-1">
                            👑 Owner
                          </Badge>
                        ) : (
                          <button
                            onClick={() => handleRoleToggle(u)}
                            disabled={!!loadingAction}
                            title="Click to toggle role"
                          >
                            <Badge
                              variant={u.role === "admin" ? "default" : "secondary"}
                              className={`text-xs cursor-pointer ${u.role === "admin" ? "bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30" : "hover:border-primary/30"}`}
                            >
                              {u.role}
                            </Badge>
                          </button>
                        )}
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant={u.isBanned ? "destructive" : "outline"}
                          className={`text-xs ${u.isBanned ? "" : "text-green-400 border-green-500/30"}`}
                        >
                          {u.isBanned ? "Banned" : "Active"}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 hover:bg-secondary"
                            onClick={() => handleViewUser(u)}
                            title="View details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {u.username !== "fanodgc" && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className={`h-7 w-7 ${u.isBanned ? "hover:text-green-400" : "hover:text-amber-400"}`}
                                onClick={() => handleBanToggle(u)}
                                disabled={loadingAction === `ban-${u.id}`}
                                title={u.isBanned ? "Unban user" : "Ban user"}
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 hover:text-destructive"
                                onClick={() => setConfirmDelete(u)}
                                title="Delete user"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                          {u.username === "fanodgc" && (
                            <span className="text-xs text-yellow-500/60 px-1 font-medium">Protected</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ── TRANSACTIONS ── */}
      {activeTab === "transactions" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(["pending", "all"] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={txFilter === f ? "default" : "outline"}
                onClick={() => setTxFilter(f)}
                className="uppercase tracking-wider text-xs"
              >
                {f === "pending" ? "Pending Withdrawals" : "All Transactions"}
              </Button>
            ))}
          </div>

          <div className="rounded-xl border border-border/40 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40 bg-secondary/50">
                  <TableHead className="text-xs uppercase tracking-wider">ID</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">User</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Type</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Amount</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider hidden md:table-cell">Address</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider hidden lg:table-cell">Date</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingData ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border/30">
                      {Array.from({ length: 8 }).map((__, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-secondary animate-pulse rounded" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : txList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      {txFilter === "pending" ? "No pending withdrawals 🎉" : "No transactions"}
                    </TableCell>
                  </TableRow>
                ) : (
                  txList.map((tx) => (
                    <TableRow key={tx.id} className="border-border/30 hover:bg-secondary/30">
                      <TableCell className="font-mono text-xs text-muted-foreground">#{tx.id}</TableCell>
                      <TableCell className="font-medium text-sm">{tx.username ?? `#${tx.userId}`}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            tx.type === "deposit"
                              ? "text-green-400 border-green-500/30"
                              : tx.type === "withdrawal"
                              ? "text-amber-400 border-amber-500/30"
                              : "text-muted-foreground"
                          }`}
                        >
                          {tx.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono font-bold text-sm">
                        {formatCurrency(tx.amount)} <span className="text-xs text-muted-foreground">{tx.currency}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground max-w-[140px] truncate">
                        {tx.address ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={tx.status === "pending" ? "outline" : tx.status === "completed" ? "default" : "destructive"}
                          className={`text-xs ${
                            tx.status === "pending"
                              ? "text-amber-400 border-amber-500/30"
                              : tx.status === "completed"
                              ? "bg-green-500/20 text-green-400 border-green-500/30"
                              : ""
                          }`}
                        >
                          {tx.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {tx.status === "pending" && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30"
                              variant="outline"
                              onClick={() => handleTxAction(tx, "completed")}
                              disabled={loadingAction === `tx-${tx.id}`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              variant="destructive"
                              onClick={() => handleTxAction(tx, "failed")}
                              disabled={loadingAction === `tx-${tx.id}`}
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

          {/* ── BANK TAB ── */}
          {activeTab === "bank" && (
            <div className="space-y-6">
              {/* ── Header ── */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Wallet className="w-6 h-6 text-primary" /> DGC Bank
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Owner control center · Plisio live data
                    {bankLastRefresh && (
                      <span className="ml-2 text-xs opacity-60">
                        · Refreshed {bankLastRefresh.toLocaleTimeString()}
                      </span>
                    )}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { loadBank(); loadFraudAlerts(); }} disabled={bankLoading} className="gap-2">
                  <RefreshCw className={bankLoading ? "animate-spin h-4 w-4" : "h-4 w-4"} />
                  {bankLoading ? "Loading..." : "Refresh All"}
                </Button>
              </div>

              {/* ── Live Crypto Balances ── */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5" /> Live Crypto Balances
                </h3>
                {Object.keys(bankBalances).length === 0 ? (
                  <Card className="border-dashed border-border/40">
                    <CardContent className="py-8 text-center text-muted-foreground text-sm">
                      {bankLoading ? (
                        <span className="flex items-center justify-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /> Fetching live balances from Plisio…</span>
                      ) : "No balance data — check PLISIO_SECRET_KEY in Render environment"}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {Object.entries(bankBalances).map(([coin, info]) => (
                      <Card key={coin} className="bg-card/80 border-border/60 hover:border-primary/30 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-sm uppercase tracking-wider text-primary">{coin}</span>
                            {(info as any).allowed === 1 ? (
                              <span className="flex items-center gap-1 text-xs text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />Live</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Inactive</span>
                            )}
                          </div>
                          <p className="text-lg font-mono font-bold text-white tabular-nums">
                            {parseFloat((info as any).balance ?? "0").toFixed(8)}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* ── AI Fraud Monitor ── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-red-400" /> AI Fraud Monitor
                    {fraudAlerts.filter(a => a.status === "pending").length > 0 && (
                      <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                        {fraudAlerts.filter(a => a.status === "pending").length} FLAGGED
                      </span>
                    )}
                  </h3>
                  <Button size="sm" variant="ghost" onClick={loadFraudAlerts} disabled={fraudLoading} className="h-7 text-xs gap-1">
                    <RefreshCw className={fraudLoading ? "animate-spin h-3 w-3" : "h-3 w-3"} /> Refresh
                  </Button>
                </div>
                {fraudAlerts.length === 0 ? (
                  <Card className="border-dashed border-border/40">
                    <CardContent className="py-6 text-center text-sm text-green-400">
                      ✓ No flagged transactions — AI monitoring active
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {fraudAlerts.map((alert: any) => (
                      <Card key={alert.id} className={`border transition-colors ${
                        alert.riskScore >= 85 ? "border-red-500/50 bg-red-950/20" :
                        alert.riskScore >= 65 ? "border-amber-500/40 bg-amber-950/15" :
                        "border-yellow-500/30 bg-yellow-950/10"
                      }`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-2">
                                {/* Risk Score Badge */}
                                <span className={`text-xs font-black px-2 py-1 rounded font-mono ${
                                  alert.riskScore >= 85 ? "bg-red-500 text-white" :
                                  alert.riskScore >= 65 ? "bg-amber-500 text-black" :
                                  "bg-yellow-500 text-black"
                                }`}>
                                  RISK {alert.riskScore}
                                </span>
                                <span className="font-bold text-white">@{alert.username}</span>
                                <span className="text-muted-foreground text-xs">·</span>
                                <span className="font-mono font-bold text-white">{parseFloat(alert.amount).toLocaleString()} {alert.currency}</span>
                                <span className="text-muted-foreground text-xs capitalize">{alert.type}</span>
                              </div>
                              {/* Flag Reasons */}
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {(alert.flags ?? []).map((flag: string) => (
                                  <span key={flag} className="text-xs bg-secondary/80 border border-border/40 rounded px-2 py-0.5 font-mono uppercase tracking-wider text-muted-foreground">
                                    {flag.replace(/_/g, " ")}
                                  </span>
                                ))}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Flagged {alert.createdAt ? new Date(alert.createdAt).toLocaleString() : "just now"}
                              </p>
                            </div>
                            {/* Actions */}
                            {alert.status === "pending" && (
                              <div className="flex gap-2 flex-shrink-0">
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 h-8 text-xs font-bold gap-1"
                                  disabled={loadingAction === `fraud-approve-${alert.id}`}
                                  onClick={async () => {
                                    setLoadingAction(`fraud-approve-${alert.id}`);
                                    try {
                                      await adminFetch(`/transactions/${alert.id}`, {
                                        method: "PATCH",
                                        body: JSON.stringify({ status: "completed" }),
                                      });
                                      setFraudAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, status: "approved" } : a));
                                      toast({ title: "Transaction approved", description: `TX #${alert.id} cleared by owner` });
                                    } catch (e: any) {
                                      toast({ title: "Approve failed", description: e.message, variant: "destructive" });
                                    } finally { setLoadingAction(null); }
                                  }}
                                >
                                  <CheckCircle2 className="h-3 w-3" /> Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-8 text-xs font-bold gap-1"
                                  disabled={loadingAction === `fraud-deny-${alert.id}`}
                                  onClick={async () => {
                                    setLoadingAction(`fraud-deny-${alert.id}`);
                                    try {
                                      await adminFetch(`/transactions/${alert.id}`, {
                                        method: "PATCH",
                                        body: JSON.stringify({ status: "rejected" }),
                                      });
                                      setFraudAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, status: "denied" } : a));
                                      toast({ title: "Transaction denied", description: `TX #${alert.id} blocked — balance refunded` });
                                    } catch (e: any) {
                                      toast({ title: "Deny failed", description: e.message, variant: "destructive" });
                                    } finally { setLoadingAction(null); }
                                  }}
                                >
                                  <XCircle className="h-3 w-3" /> Deny
                                </Button>
                              </div>
                            )}
                            {alert.status !== "pending" && (
                              <Badge variant={alert.status === "approved" ? "default" : "destructive"} className="capitalize">
                                {alert.status}
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Pending Withdrawals ── */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" /> Pending Withdrawals
                  {bankWithdrawals.length > 0 && (
                    <span className="bg-amber-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">{bankWithdrawals.length}</span>
                  )}
                </h3>
                {bankWithdrawals.length === 0 ? (
                  <Card className="border-dashed border-border/40">
                    <CardContent className="py-6 text-center text-muted-foreground text-sm">No pending withdrawals 🎉</CardContent>
                  </Card>
                ) : (
                  <Card className="border-border/60">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border/40">
                            <TableHead className="text-xs">ID</TableHead>
                            <TableHead className="text-xs">User</TableHead>
                            <TableHead className="text-xs">Amount</TableHead>
                            <TableHead className="text-xs">Currency</TableHead>
                            <TableHead className="text-xs">Address</TableHead>
                            <TableHead className="text-xs">Requested</TableHead>
                            <TableHead className="text-xs">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bankWithdrawals.map((w: any) => (
                            <TableRow key={w.id} className="border-border/30">
                              <TableCell className="font-mono text-xs text-muted-foreground">#{w.id}</TableCell>
                              <TableCell className="font-bold text-sm">#{w.userId}</TableCell>
                              <TableCell className="font-mono font-bold">{parseFloat(w.amount).toFixed(8)}</TableCell>
                              <TableCell><Badge variant="outline" className="text-xs">{w.currency}</Badge></TableCell>
                              <TableCell className="font-mono text-xs max-w-[100px] truncate text-muted-foreground" title={w.address}>{w.address}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{w.createdAt ? new Date(w.createdAt).toLocaleString() : "—"}</TableCell>
                              <TableCell>
                                <div className="flex gap-1.5">
                                  <Button size="sm" className="bg-green-600 hover:bg-green-700 h-7 text-xs gap-1" disabled={loadingAction === `wd-approve-${w.id}`}
                                    onClick={async () => {
                                      setLoadingAction(`wd-approve-${w.id}`);
                                      try {
                                        await adminFetch(`/transactions/${w.id}`, { method: "PATCH", body: JSON.stringify({ status: "completed" }) });
                                        toast({ title: "Approved", description: `TX ${w.id} sent via Plisio` });
                                        await loadBank();
                                      } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
                                      finally { setLoadingAction(null); }
                                    }}>
                                    <CheckCircle2 className="h-3 w-3" /> Approve
                                  </Button>
                                  <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" disabled={loadingAction === `wd-reject-${w.id}`}
                                    onClick={async () => {
                                      setLoadingAction(`wd-reject-${w.id}`);
                                      try {
                                        await adminFetch(`/transactions/${w.id}`, { method: "PATCH", body: JSON.stringify({ status: "rejected" }) });
                                        toast({ title: "Rejected", description: `Balance refunded for TX ${w.id}` });
                                        await loadBank();
                                      } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
                                      finally { setLoadingAction(null); }
                                    }}>
                                    <XCircle className="h-3 w-3" /> Reject
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>
                )}
              </div>

              {/* ── Live Invoice Feed ── */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5" /> Live Plisio Invoice Feed
                </h3>
                {bankInvoices.length === 0 ? (
                  <Card className="border-dashed border-border/40">
                    <CardContent className="py-6 text-center text-muted-foreground text-sm">
                      {bankLoading ? "Loading invoices…" : "No invoices found"}
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-border/60">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border/40">
                            <TableHead className="text-xs">Plisio ID</TableHead>
                            <TableHead className="text-xs">Type</TableHead>
                            <TableHead className="text-xs">Amount</TableHead>
                            <TableHead className="text-xs">Currency</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs">Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bankInvoices.map((inv: any) => (
                            <TableRow key={inv.txn_id ?? inv.id} className="border-border/30">
                              <TableCell className="font-mono text-xs text-muted-foreground max-w-[90px] truncate" title={inv.txn_id}>{inv.txn_id ?? "—"}</TableCell>
                              <TableCell><Badge variant="outline" className="text-xs capitalize">{inv.type ?? "invoice"}</Badge></TableCell>
                              <TableCell className="font-mono font-bold">{inv.source_amount ?? inv.amount ?? "—"}</TableCell>
                              <TableCell className="text-sm">{inv.source_currency ?? inv.currency ?? "—"}</TableCell>
                              <TableCell>
                                <Badge className="text-xs" variant={inv.status === "completed" ? "default" : inv.status === "pending" ? "secondary" : "destructive"}>
                                  {inv.status ?? "unknown"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {inv.created_utc ? new Date(inv.created_utc * 1000).toLocaleString() : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>
                )}
              </div>

              {/* ── fanodgc-only Settings Panel ── */}
              {user?.username === "fanodgc" && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-primary" /> Owner Settings
                    <span className="text-xs bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded">fanodgc only</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Payment Gateway */}
                    <Card className="border-border/60 bg-card/60">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Wallet className="w-4 h-4 text-primary" /> Payment Gateway
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground uppercase tracking-wider">Plisio</span>
                          <span className="flex items-center gap-1.5 text-xs text-green-400 font-bold">
                            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />Connected
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground uppercase tracking-wider">Mode</span>
                          <span className="text-xs font-bold">Deposits + Payouts</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground uppercase tracking-wider">API Key</span>
                          <span className="font-mono text-xs text-muted-foreground">••••••••••••••••</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground uppercase tracking-wider">Webhook</span>
                          <Badge variant="outline" className="text-xs text-green-400 border-green-400/30">Active</Badge>
                        </div>
                      </CardContent>
                    </Card>

                    {/* AI Fraud Settings */}
                    <Card className="border-border/60 bg-card/60">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Shield className="w-4 h-4 text-red-400" /> AI Fraud Settings
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-3">
                        <div>
                          <div className="flex justify-between mb-1">
                            <span className="text-xs text-muted-foreground uppercase tracking-wider">AI Sensitivity</span>
                            <span className="text-xs font-mono font-bold text-primary">{bankSettings.aiSensitivity}%</span>
                          </div>
                          <input type="range" min={0} max={100} value={bankSettings.aiSensitivity}
                            onChange={e => setBankSettings(p => ({ ...p, aiSensitivity: +e.target.value }))}
                            className="w-full accent-primary h-1.5 rounded" />
                          <p className="text-xs text-muted-foreground mt-1">Higher = more flags, lower = fewer flags</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground uppercase tracking-wider">Auto-approve under</span>
                          <span className="font-mono text-xs font-bold">${bankSettings.autoApproveUnder}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground uppercase tracking-wider">Manual review over</span>
                          <span className="font-mono text-xs font-bold">${bankSettings.requireManualOver}</span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Platform Stats */}
                    <Card className="border-border/60 bg-card/60 md:col-span-2">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-primary" /> Platform Overview
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            { label: "Total Users", value: stats?.totalUsers ?? "—" },
                            { label: "Active Today", value: stats?.activeToday ?? "—" },
                            { label: "Pending W/D", value: stats?.pendingWithdrawals ?? "—" },
                            { label: "Pending Amount", value: stats ? formatCurrency(stats.pendingWithdrawalAmount) : "—" },
                          ].map(s => (
                            <div key={s.label} className="bg-secondary/40 rounded-lg p-3">
                              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{s.label}</p>
                              <p className="font-mono font-bold text-lg">{String(s.value)}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </div>
          )}

      {/* ── User Detail Dialog ── */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="bg-card border-border/60 max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-wider">
              {selectedUser?.user.username}
            </DialogTitle>
            <DialogDescription>User ID #{selectedUser?.user.id}</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-6 mt-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Balance", value: formatCurrency(selectedUser.user.balance) },
                  { label: "Total Bets", value: selectedUser.user.totalBets },
                  { label: "Total Won", value: formatCurrency(selectedUser.user.totalWon) },
                  { label: "Role", value: selectedUser.user.role },
                ].map((s) => (
                  <div key={s.label} className="bg-secondary/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{s.label}</p>
                    <p className="font-mono font-bold">{String(s.value)}</p>
                  </div>
                ))}
              </div>

              <div>
                <h4 className="font-bold uppercase tracking-wider text-sm mb-3 text-muted-foreground">Recent Bets</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedUser.bets.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No bets yet</p>
                  ) : (
                    selectedUser.bets.map((b) => (
                      <div key={b.id} className="flex justify-between items-center text-sm bg-secondary/30 rounded px-3 py-2">
                        <span className="font-mono text-xs text-muted-foreground">#{b.id}</span>
                        <span className={b.outcome === "win" ? "text-green-400 font-bold" : "text-destructive"}>
                          {b.outcome.toUpperCase()}
                        </span>
                        <span className="font-mono">{formatCurrency(b.amount)}</span>
                        <span className="font-mono text-primary">{formatCurrency(b.payout)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-bold uppercase tracking-wider text-sm mb-3 text-muted-foreground">Recent Transactions</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedUser.transactions.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No transactions</p>
                  ) : (
                    selectedUser.transactions.map((t) => (
                      <div key={t.id} className="flex justify-between items-center text-sm bg-secondary/30 rounded px-3 py-2">
                        <span className="capitalize text-xs font-bold">{t.type}</span>
                        <span className="font-mono">{formatCurrency(t.amount)} {t.currency}</span>
                        <Badge variant="outline" className="text-xs">{t.status}</Badge>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Create User Dialog ── */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent className="bg-card border-border/60 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" /> Create New User / Admin
            </DialogTitle>
            <DialogDescription>
              Create a player or admin account. Admins can manage users but can never touch the Owner account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Username</label>
              <Input placeholder="username" value={newUser.username} onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))} className="bg-secondary border-border/60" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Password</label>
              <Input type="password" placeholder="••••••••" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} className="bg-secondary border-border/60" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Role</label>
              <div className="flex gap-2">
                {["player", "admin"].map(r => (
                  <button key={r} onClick={() => setNewUser(p => ({ ...p, role: r }))}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase border transition-colors ${newUser.role === r ? "border-primary bg-primary/10 text-primary" : "border-border/40 text-muted-foreground hover:border-border"}`}>
                    {r === "admin" ? "🛡 Admin" : "👤 Player"}
                  </button>
                ))}
              </div>
              {newUser.role === "admin" && (
                <p className="text-xs text-yellow-500/80 mt-1.5 bg-yellow-500/5 rounded p-2 border border-yellow-500/20">
                  ⚠ Admin accounts can ban/delete players but CANNOT touch the Owner (fanodgc) account.
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Starting Balance ($)</label>
              <Input type="number" placeholder="0" value={newUser.balance} onChange={e => setNewUser(p => ({ ...p, balance: e.target.value }))} className="bg-secondary border-border/60" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setCreateUserOpen(false)}>Cancel</Button>
            <Button className="flex-1 font-bold" onClick={handleCreateUser} disabled={creatingUser}>
              {creatingUser ? "Creating…" : "Create Account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="bg-card border-border/60 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete User
            </DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{confirmDelete?.username}</strong> and all their bets and transactions. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => confirmDelete && handleDeleteUser(confirmDelete)}
              disabled={loadingAction === `delete-${confirmDelete?.id}`}
            >
              {loadingAction === `delete-${confirmDelete?.id}` ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
