import { useState, useEffect, useCallback, useRef } from "react";
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
  KeyRound,
  Activity,
  Clock,
  MapPin,
  Trophy,
  Plus,
  Calendar,
  Award,
  MessageSquare,
  Send,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_BASE = "/api/admin";

function getToken() {
  return typeof localStorage !== "undefined" ? localStorage.getItem("dgc_token") : null;
}

function bankSessionValid(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  const tok = sessionStorage.getItem("dgcBankSession");
  const exp = sessionStorage.getItem("dgcBankExpires");
  if (!tok || !exp) return false;
  return new Date(exp).getTime() > Date.now();
}

function clearBankSession() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem("dgcBankSession");
  sessionStorage.removeItem("dgcBankExpires");
}

async function adminFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const bankSession =
    typeof sessionStorage !== "undefined" ? sessionStorage.getItem("dgcBankSession") : null;
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token ?? ""}`,
      ...(bankSession ? { "x-bank-session": bankSession } : {}),
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
  // ── Extended fields (returned by GET /users/:id detail only) ──
  accountType?: string;
  withdrawalsEnabled?: boolean;
  promoBalance?: number;
  totalDeposited?: number;
  totalWageredAmount?: number;
  locationVerified?: boolean;
  geoIp?: string | null;
  geoCountry?: string | null;
  geoCountryCode?: string | null;
  geoRegion?: string | null;
  geoCity?: string | null;
  geoHostname?: string | null;
  geoAsn?: string | null;
  geoIsp?: string | null;
  geoLat?: string | null;
  geoLon?: string | null;
  geoTimezone?: string | null;
  vpnDetected?: boolean | null;
  vpnProvider?: string | null;
  deviceFingerprint?: string | null;
  deviceName?: string | null;
  deviceOs?: string | null;
  deviceBrowser?: string | null;
  deviceType?: string | null;
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
  txHash?: string | null;
  plisioTrackId?: string | null;
  orderId?: string | null;
  createdAt: string;
}

interface AdminStats {
  totalUsers: number;
  activeToday: number;
  totalDeposited: number;
  totalWithdrawn: number;
  newUsersToday: number;
  totalBets: number;
  totalWagered: number;
  biggestWin: number;
  pendingWithdrawals: number;
  pendingWithdrawalAmount: number;
  needsReviewWithdrawals: number;
  needsReviewAmount: number;
  bannedUsers: number;
}

interface UserDetail {
  user: AdminUser;
  bets: { id: number; gameId: number; amount: number; payout: number; outcome: string; createdAt: string }[];
  transactions: { id: number; type: string; amount: number; currency: string; status: string; address: string | null; createdAt: string }[];
}

type TabKey = "overview" | "users" | "transactions" | "bank" | "tournaments" | "chat";

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
  const [adminPin, setAdminPin] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinRegenLoading, setPinRegenLoading] = useState(false);
  const [balanceEdit, setBalanceEdit] = useState<{ userId: number; value: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "player", balance: "0" });
  const [creatingUser, setCreatingUser] = useState(false);
  // ── Bank state ──
  const [bankBalances, setBankBalances] = useState<Record<string, { balance: string; allowed: number }>>({});
  const [bankInvoices, setBankInvoices] = useState<any[]>([]);
  const [invoicePage, setInvoicePage] = useState(1);
  const [bankWithdrawals, setBankWithdrawals] = useState<any[]>([]);
  const [pendingDeposits, setPendingDeposits] = useState<any[]>([]);
  const [allLiveTx, setAllLiveTx] = useState<any[]>([]);
  const [newPendingDeposits, setNewPendingDeposits] = useState(0);
  const prevPendingCountRef = useRef<number>(0);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankLastRefresh, setBankLastRefresh] = useState<Date | null>(null);
  const [fraudAlerts, setFraudAlerts] = useState<any[]>([]);
  const [fraudLoading, setFraudLoading] = useState(false);
  // ── Reconcile queue (withdrawals stuck in needs_review / stale processing) ──
  const [needsReview, setNeedsReview] = useState<any[]>([]);
  const [needsReviewLoading, setNeedsReviewLoading] = useState(false);
  const [plisioStatus, setPlisioStatus] = useState<
    Record<number, { found: boolean; sent: boolean | null; status?: string; operationId?: string | null }>
  >({});
  const [bankSettings, setBankSettings] = useState({
    aiSensitivity: 75,
    autoApproveUnder: 50,
    requireManualOver: 500,
    plisioConnected: true,
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  // ── Tournament state ──
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [tourneyLoading, setTourneyLoading] = useState(false);
  const [createTourneyOpen, setCreateTourneyOpen] = useState(false);
  const [editTourney, setEditTourney] = useState<any | null>(null);
  const [newTourney, setNewTourney] = useState({ name: "", description: "", prize: "0", startAt: "", endAt: "" });
  const [tourneyLeaderboard, setTourneyLeaderboard] = useState<{ tournament: any; leaderboard: any[] } | null>(null);
  const [awardingTourney, setAwardingTourney] = useState<{ tournamentId: number; userId: number; username: string; amount: string } | null>(null);
  // ── Admin Chat state ──
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatLastId, setChatLastId] = useState(0);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  // ── Messaging (DMs + Broadcasts) ──
  const [chatMode, setChatMode] = useState<"group" | "direct" | "broadcast">("group");
  const [recipients, setRecipients] = useState<{ admins: any[]; creators: any[] }>({ admins: [], creators: [] });
  const [selectedRecipient, setSelectedRecipient] = useState<{ id: number; username: string; type: "admin" | "creator" } | null>(null);
  const [dmMessages, setDmMessages] = useState<any[]>([]);
  const [broadcastType, setBroadcastType] = useState<"broadcast_all" | "broadcast_admins" | "broadcast_creators">("broadcast_all");
  const [broadcastMessages, setBroadcastMessages] = useState<any[]>([]);
  const [msgInput, setMsgInput] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  // ── DGC Bank PIN session (gates the bank tab for regular admins) ──
  // The platform owner (fanodgc) always has the bank unlocked — no PIN ever required.
  // For non-owner admins, the bank is unlocked only when a valid session token is stored.
  const [bankUnlocked, setBankUnlocked] = useState<boolean>(() => {
    // We can't read `user` here (not yet available at init time), so we start with
    // session-storage check. The owner bypass is applied in the useEffect below once
    // the user object is loaded.
    return bankSessionValid();
  });
  const [bankPinInput, setBankPinInput] = useState("");
  const [bankPinError, setBankPinError] = useState("");
  const [bankPinVerifying, setBankPinVerifying] = useState(false);

  const loadBankSettings = useCallback(async () => {
    try {
      const res = await adminFetch("/bank/settings");
      if (res?.settings) {
        setBankSettings(p => ({ ...p, ...res.settings }));
      }
    } catch {
      // fanodgc-only endpoint — silently ignore for non-owner admins
    }
  }, []);

  const saveBankSettings = useCallback(async (updates: Partial<typeof bankSettings>) => {
    setSettingsSaving(true);
    setSettingsSaved(false);
    try {
      const res = await adminFetch("/bank/settings", {
        method: "PUT",
        body: JSON.stringify(updates),
      });
      if (res?.settings) {
        setBankSettings(p => ({ ...p, ...res.settings }));
      }
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch (e: any) {
      toast({ title: "Settings save failed", description: e.message, variant: "destructive" });
    } finally {
      setSettingsSaving(false);
    }
  }, [toast]);

  const isOwner = (user?.username ?? "").toLowerCase() === "fanodgc";
  const isAdmin = user?.role === "admin" || user?.role === "owner" || isOwner;

  // Owner bypass: fanodgc never needs to enter a PIN — unlock the bank automatically
  // as soon as the user object is available and confirmed to be the owner.
  useEffect(() => {
    if (isOwner && !bankUnlocked) {
      setBankUnlocked(true);
    }
  }, [isOwner, bankUnlocked]);

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




  const loadTournaments = useCallback(async () => {
    setTourneyLoading(true);
    try {
      const data = await adminFetch("/tournaments");
      setTournaments(data);
    } catch (err: any) {
      toast({ title: "Tournaments error", description: err.message, variant: "destructive" });
    } finally {
      setTourneyLoading(false);
    }
  }, [toast]);

    const loadFraudAlerts = useCallback(async () => {
    setFraudLoading(true);
    try {
      const res = await adminFetch("/bank/fraud-alerts");
      setFraudAlerts(res.alerts ?? []);
    } catch (err: any) {
      // Show real error — never use mock data in production
      console.error("Fraud alerts fetch error:", err);
      toast({ title: "Fraud monitor error", description: err?.message ?? "Could not load fraud alerts", variant: "destructive" });
      setFraudAlerts([]);
    } finally {
      setFraudLoading(false);
    }
  }, []);

  const loadNeedsReview = useCallback(async () => {
    setNeedsReviewLoading(true);
    try {
      const res = await adminFetch("/transactions/needs-review");
      setNeedsReview(res.withdrawals ?? []);
    } catch (err: any) {
      toast({ title: "Reconcile queue error", description: err?.message ?? "Could not load needs-review queue", variant: "destructive" });
      setNeedsReview([]);
    } finally {
      setNeedsReviewLoading(false);
    }
  }, [toast]);

  const loadBank = useCallback(async () => {
    setBankLoading(true);
    try {
      // Invoices are owner-only (server-enforced); regular admins skip them.
      const tasks: Promise<any>[] = [
        adminFetch("/bank/balances"),
        adminFetch("/bank/pending-withdrawals"),
        adminFetch("/transactions?status=pending&type=deposit&limit=50"),
        adminFetch("/transactions?limit=50"),
      ];
      if (isOwner) tasks.push(adminFetch(`/bank/invoices?limit=25&page=${invoicePage}`));
      const [balR, wdR, depR, liveR, invR] = await Promise.allSettled(tasks);

      if (balR.status === "fulfilled") setBankBalances(balR.value.balances ?? {});
      if (wdR.status === "fulfilled") setBankWithdrawals(wdR.value.withdrawals ?? []);
      if (depR && depR.status === "fulfilled") {
        const deps = Array.isArray(depR.value) ? depR.value : [];
        setPendingDeposits(deps);
        const pendingCount = deps.filter((d: any) => d.type === "deposit" && d.status === "pending").length;
        const prev = prevPendingCountRef.current;
        if (pendingCount > prev && prev >= 0) {
          setNewPendingDeposits(pendingCount - prev);
        }
        prevPendingCountRef.current = pendingCount;
      }
      if (liveR && liveR.status === "fulfilled") setAllLiveTx(Array.isArray(liveR.value) ? liveR.value : []);
      if (isOwner && invR && invR.status === "fulfilled") setBankInvoices(invR.value.invoices ?? []);

      // Surface failures without blanking the whole view; relock on lost session.
      const reasons = [balR, wdR, depR, liveR, invR]
        .filter((r): r is PromiseRejectedResult => !!r && r.status === "rejected")
        .map((r) => String(r.reason?.message ?? r.reason ?? ""));
      if (reasons.some((m) => /locked|expired/i.test(m))) {
        clearBankSession();
        setBankUnlocked(false);
      } else if (reasons.length > 0) {
        toast({ title: "Some bank data failed to load", description: reasons[0], variant: "destructive" });
      }
      setBankLastRefresh(new Date());
    } finally {
      setBankLoading(false);
    }
  }, [isOwner, invoicePage, toast]);

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
    if (activeTab === "bank" && isAdmin && bankUnlocked) {
      loadBank();
      loadFraudAlerts();
      loadNeedsReview();
      if (isOwner) loadBankSettings();
    }
  }, [activeTab, isAdmin, bankUnlocked, isOwner, loadBank, loadFraudAlerts, loadNeedsReview, loadBankSettings]);

  useEffect(() => {
    if (activeTab === "tournaments" && isAdmin) loadTournaments();
  }, [activeTab, isAdmin, loadTournaments]);

  const loadChat = useCallback(async (since?: number) => {
    try {
      const data = await adminFetch(`/chat${since ? `?since=${since}` : ""}`);
      if (data.messages?.length > 0) {
        setChatMessages(prev => {
          const existingIds = new Set(prev.map((m: any) => m.id));
          const newMsgs = data.messages.filter((m: any) => !existingIds.has(m.id));
          if (!newMsgs.length) return prev;
          const merged = since ? [...prev, ...newMsgs] : data.messages;
          setChatLastId(merged[merged.length - 1]?.id ?? 0);
          return merged;
        });
        setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      } else if (!since) {
        setChatMessages(data.messages ?? []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (activeTab !== "chat" || chatMode !== "group") return;
    loadChat();
    const id = setInterval(() => {
      setChatLastId(prev => { loadChat(prev); return prev; });
    }, 3000);
    return () => clearInterval(id);
  }, [activeTab, chatMode, loadChat]);

  // Poll unread count (even when not on Chat tab)
  useEffect(() => {
    if (!isAdmin) return;
    const pollUnread = () => {
      setChatLastId(prev => {
        adminFetch(`/chat/unread?lastGroupId=${prev}`).then((d: any) => {
          if (typeof d.total === "number") setUnreadChatCount(d.total);
        }).catch(() => {});
        return prev;
      });
    };
    const id = setInterval(pollUnread, 8000);
    return () => clearInterval(id);
  }, [isAdmin]);

  // Load recipients list when chat mode changes
  useEffect(() => {
    if (activeTab !== "chat" || chatMode === "group") return;
    adminFetch("/chat/recipients").then((d: any) => {
      if (d.admins || d.creators) setRecipients(d);
    }).catch(() => {});
  }, [activeTab, chatMode]);

  // Load DM messages when recipient selected
  useEffect(() => {
    if (!selectedRecipient) return;
    adminFetch(`/messages?recipientType=direct&recipientId=${selectedRecipient.id}`).then((d: any) => {
      if (d.messages) setDmMessages(d.messages);
    }).catch(() => {});
  }, [selectedRecipient]);

  // Load broadcast history
  useEffect(() => {
    if (activeTab !== "chat" || chatMode !== "broadcast") return;
    adminFetch(`/messages?recipientType=${broadcastType}`).then((d: any) => {
      if (d.messages) setBroadcastMessages(d.messages);
    }).catch(() => {});
  }, [activeTab, chatMode, broadcastType]);

  // Auto-refresh bank every 15 seconds while bank tab is active + unlocked
  useEffect(() => {
    if (activeTab !== "bank" || !bankUnlocked) return;
    const id = setInterval(() => {
      loadBank();
    }, 15000);
    return () => clearInterval(id);
  }, [activeTab, bankUnlocked, loadBank]);

  // Open the DGC Bank tab when navigated to /admin?tab=bank (e.g. from the header).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "bank" || t === "users" || t === "overview") {
      setActiveTab(t as TabKey);
      if (t === "bank") setNewPendingDeposits(0);
    }
  }, []);

  // Relock automatically if the bank session expires while the page is open.
  // The owner (fanodgc) is never relocked — they don't use session tokens.
  useEffect(() => {
    if (!bankUnlocked) return;
    const id = setInterval(() => {
      // Owner never expires — skip the session check for fanodgc
      if (!isOwner && !bankSessionValid()) setBankUnlocked(false);
    }, 30000);
    return () => clearInterval(id);
  }, [bankUnlocked, isOwner]);

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
        body: JSON.stringify({ role: u.role === "admin" ? "creator" : u.role === "creator" ? "player" : "admin" }),
      });
      toast({ title: "Role updated", description: `${u.username} is now ${u.role === "admin" ? "creator" : u.role === "creator" ? "player" : "admin"}` });
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

  // Manually credit a pending deposit when the Plisio IPN callback failed.
  // Safe to call twice — the backend is idempotent (guarded status flip).
  async function handleCompleteDeposit(tx: AdminTx) {
    if (!window.confirm(`Manually credit deposit #${tx.id} (${formatCurrency(tx.amount)} ${tx.currency}) to ${tx.username ?? "user"}?\n\nOnly do this after confirming the payment landed in your Plisio merchant account.`)) return;
    setLoadingAction(`dep-${tx.id}`);
    try {
      await adminFetch(`/transactions/${tx.id}/complete-deposit`, { method: "POST" });
      toast({
        title: "Deposit credited",
        description: `${formatCurrency(tx.amount)} added to ${tx.username ?? "user"}'s balance.`,
      });
      loadTransactions();
      loadStats();
    } catch (err: any) {
      toast({ title: "Credit failed", description: err.message, variant: "destructive" });
    } finally {
      setLoadingAction(null);
    }
  }


  // Mark a pending deposit as declined — does NOT credit the user.
  async function handleDeclineDeposit(tx: AdminTx) {
    if (!window.confirm(
      `Decline deposit #${tx.id} (${formatCurrency(tx.amount)} ${tx.currency}) for ${tx.username ?? "user"}?\n\nThis marks it DECLINED with no funds credited. Only do this if the payment did NOT arrive in your Plisio account.`
    )) return;
    setLoadingAction(`dep-decline-${tx.id}`);
    try {
      await adminFetch(`/transactions/${tx.id}/decline-deposit`, { method: "POST" });
      toast({ title: "Deposit declined", description: `#${tx.id} marked declined — no funds added.`, variant: "destructive" });
      loadBank(); loadStats();
    } catch (err: any) {
      toast({ title: "Decline failed", description: err.message, variant: "destructive" });
    } finally { setLoadingAction(null); }
  }

  // Resolve an ambiguous withdrawal. Every path requires the owner to verify in Plisio
  // first; the wording is deliberately blunt because each choice moves (or risks) real money.
  async function handleReconcile(w: any, resolution: "mark_completed" | "cancel_refund" | "requeue") {
    const amt = `${parseFloat(w.amount).toFixed(8)} ${w.currency}`;
    const body: { resolution: string; txHash?: string; confirmedNotSent?: boolean } = { resolution };
    if (resolution === "mark_completed") {
      if (!window.confirm(`Mark TX #${w.id} (${amt}) as COMPLETED?\n\nOnly do this after confirming in your Plisio dashboard that the payout WAS actually sent. The user is NOT refunded.`)) return;
      const hash = window.prompt("Optional: paste the Plisio payout / transaction id to record (leave blank to skip):", w.txHash ?? "");
      if (hash && hash.trim()) body.txHash = hash.trim();
    } else if (resolution === "cancel_refund") {
      if (!window.confirm(`Cancel TX #${w.id} and REFUND ${amt} to the user?\n\nOnly do this after confirming in Plisio that the payout was NOT sent.`)) return;
    } else {
      if (!window.confirm(`Re-queue TX #${w.id} (${amt}) for another payout attempt?\n\n⚠ ONLY if you have confirmed in Plisio the funds were NOT sent. Re-queuing a payout that already went out will pay the user TWICE.`)) return;
      body.confirmedNotSent = true;
    }
    setLoadingAction(`reconcile-${w.id}`);
    try {
      await adminFetch(`/transactions/${w.id}/reconcile`, { method: "POST", body: JSON.stringify(body) });
      const labels: Record<string, string> = { mark_completed: "marked completed", cancel_refund: "cancelled & refunded", requeue: "re-queued" };
      toast({ title: "Resolved", description: `TX #${w.id} ${labels[resolution]}` });
      await loadNeedsReview();
      await loadBank();
      loadStats();
    } catch (err: any) {
      toast({ title: "Reconcile failed", description: err.message, variant: "destructive" });
    } finally {
      setLoadingAction(null);
    }
  }

  // Ask Plisio directly whether a payout actually went out, so the owner can reconcile from here
  // instead of digging through the Plisio dashboard. Cached per-row; the same check is enforced
  // server-side before cancel/refund or retry.
  async function checkPlisioStatus(w: any) {
    setLoadingAction(`plisio-${w.id}`);
    try {
      const res = await adminFetch(`/transactions/${w.id}/plisio-status`);
      setPlisioStatus((prev) => ({ ...prev, [w.id]: res }));
      const label = res.found
        ? res.sent === true
          ? "Plisio reports this payout WAS sent."
          : res.sent === false
            ? "Plisio reports this payout was NOT sent."
            : `Plisio reports status: ${res.status ?? "pending"}.`
        : "Plisio has no confirmable record for this payout — verify in your dashboard.";
      toast({ title: `TX #${w.id}`, description: label });
    } catch (err: any) {
      toast({ title: "Plisio lookup failed", description: err?.message ?? "Could not reach Plisio", variant: "destructive" });
    } finally {
      setLoadingAction(null);
    }
  }

  async function fetchAdminPin(userId: number) {
    setPinLoading(true);
    setAdminPin(null);
    try {
      const res = await adminFetch(`/users/${userId}/bank-pin`);
      setAdminPin(res.pin ?? "No PIN set");
    } catch {
      setAdminPin(null);
    } finally {
      setPinLoading(false);
    }
  }

  async function handleRegenPin(userId: number) {
    setPinRegenLoading(true);
    try {
      const res = await adminFetch(`/users/${userId}/regenerate-pin`, { method: "POST" });
      setAdminPin(res.pin);
      toast({ title: "New PIN Generated", description: `PIN for this admin: ${res.pin}`, className: "bg-emerald-900 border-emerald-500" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setPinRegenLoading(false);
    }
  }

  async function verifyBankPin() {
    if (bankPinInput.length < 5) return;
    setBankPinVerifying(true);
    setBankPinError("");
    try {
      const data = await adminFetch("/verify-bank-pin", {
        method: "POST",
        body: JSON.stringify({ pin: bankPinInput }),
      });
      sessionStorage.setItem("dgcBankSession", data.sessionToken);
      sessionStorage.setItem("dgcBankExpires", data.expiresAt);
      setBankPinInput("");
      setBankUnlocked(true);
    } catch (e: any) {
      setBankPinError(e?.message ?? "Incorrect PIN");
      setBankPinInput("");
    } finally {
      setBankPinVerifying(false);
    }
  }

  async function handleViewUser(u: AdminUser) {
    setAdminPin(null); // reset so the previous user's PIN never lingers
    try {
      const data = await adminFetch(`/users/${u.id}`);
      setSelectedUser(data);
      // Owner-only: fetch this specific admin's PIN.
      if (isOwner && data?.user?.role === "admin") {
        void fetchAdminPin(u.id);
      }
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

  // Owner: Overview / Users / DGC Bank (in-panel, PIN-gated).
  // Regular admin: Overview / Users only — their DGC Bank lives on the header.
  const TABS: { key: TabKey; label: string; icon: React.ElementType; badge?: number }[] = isOwner
    ? [
        { key: "overview", label: "Overview", icon: Activity },
        { key: "users", label: "Users", icon: Users },
        { key: "bank", label: "DGC Bank", icon: DollarSign },
        { key: "tournaments", label: "Tournaments", icon: Trophy },
        { key: "chat", label: "Chat", icon: MessageSquare, badge: unreadChatCount },
      ]
    : [
        { key: "overview", label: "Overview", icon: Activity },
        { key: "users", label: "Users", icon: Users },
        { key: "chat", label: "Chat", icon: MessageSquare, badge: unreadChatCount },
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
            if (activeTab === "bank") { loadBank(); loadFraudAlerts(); loadNeedsReview(); }
            if (activeTab === "tournaments") loadTournaments();
            if (activeTab === "chat") loadChat();
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
            onClick={() => { setActiveTab(tab.key); if (tab.key === "bank") setNewPendingDeposits(0); }}
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
            {tab.key === "bank" && newPendingDeposits > 0 && (
              <span className="ml-1 bg-amber-500 text-black text-xs rounded-full w-5 h-5 flex items-center justify-center font-mono animate-pulse font-bold">
                {newPendingDeposits}
              </span>
            )}
            {tab.key === "chat" && tab.badge != null && tab.badge > 0 && activeTab !== "chat" && (
              <span className="ml-1 bg-primary text-primary-foreground text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center font-mono animate-pulse font-bold px-1">
                {tab.badge > 99 ? "99+" : tab.badge}
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
              { label: "Total Users", value: stats?.totalUsers ?? "—", icon: Users, color: "text-blue-400", bg: "from-blue-500/10 to-transparent", tab: "users" as TabKey, detail: "Total registered accounts on the platform." },
              { label: "Total Bets", value: stats?.totalBets ?? "—", icon: Activity, color: "text-purple-400", bg: "from-purple-500/10 to-transparent", tab: "users" as TabKey, detail: "Lifetime bets placed across all games. Click a user to see their full history." },
              { label: "Total Wagered", value: stats ? formatCurrency(stats.totalWagered) : "—", icon: TrendingUp, color: "text-green-400", bg: "from-green-500/10 to-transparent", tab: "users" as TabKey, detail: "Total USD-equivalent wagered by all players. See Users tab for per-player wager totals." },
              { label: "Biggest Win", value: stats ? formatCurrency(stats.biggestWin) : "—", icon: TrendingUp, color: "text-primary", bg: "from-primary/10 to-transparent", tab: "users" as TabKey, detail: "Largest single payout ever recorded. Sort Users by 'Total Won' to see top winners." },
            ].map((s) => (
              <Card
                key={s.label}
                role="button"
                tabIndex={0}
                onClick={() => setActiveTab(s.tab)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveTab(s.tab); } }}
                className="bg-secondary/40 border-border/40 card-hover-glow overflow-hidden cursor-pointer hover:border-primary/40 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <CardContent className="p-0">
                  <div className={`bg-gradient-to-br ${s.bg} p-5`}>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">{s.label}</span>
                      <div className={`w-9 h-9 rounded-xl bg-background/40 flex items-center justify-center`}>
                        <s.icon className={`w-5 h-5 ${s.color}`} />
                      </div>
                    </div>
                    <p className={`font-black leading-none break-all ${String(s.value).length > 10 ? "text-xl" : "text-3xl"} ${s.color}`}>{String(s.value)}</p>
                    {"detail" in s && s.detail && (
                      <p className="text-xs text-muted-foreground mt-2 leading-relaxed opacity-70">{s.detail as string}</p>
                    )}
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
                  <Button size="sm" className="mt-3 w-full" onClick={() => setActiveTab("bank")}>
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

            <Card
              role="button"
              tabIndex={0}
              onClick={() => setActiveTab("bank")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveTab("bank"); } }}
              className="bg-secondary/40 border-border/40 card-hover-glow cursor-pointer hover:border-primary/40 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
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
                          variant={tx.status === "completed" ? "default" : tx.status === "failed" || tx.status === "declined" ? "destructive" : "outline"}
                          className={`text-xs ${
                            tx.status === "pending"
                              ? "text-amber-400 border-amber-500/30"
                              : tx.status === "completed"
                              ? "bg-green-500/20 text-green-400 border-green-500/30"
                              : tx.status === "needs_review"
                              ? "text-orange-400 border-orange-500/40"
                              : tx.status === "processing"
                              ? "text-blue-400 border-blue-500/40"
                              : ""
                          }`}
                        >
                          {tx.status === "needs_review" ? "Under review" : tx.status === "processing" ? "Processing" : tx.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {tx.type === "deposit" && tx.plisioTrackId && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              variant="outline"
                              onClick={() => window.open(`https://plisio.net/invoice/${tx.plisioTrackId}`, "_blank")}
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              View Invoice
                            </Button>
                          </div>
                        )}
                        {tx.status === "pending" && tx.type === "withdrawal" && (
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

          {/* ── BANK TAB: PIN GATE — never shown to the owner (fanodgc) ── */}
          {activeTab === "bank" && !bankUnlocked && !isOwner && (
            <div className="max-w-md mx-auto mt-10">
              <Card className="border-emerald-500/30 bg-emerald-950/20">
                <CardContent className="p-8 space-y-5 text-center">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                    <Wallet className="w-7 h-7 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="font-display font-black uppercase tracking-widest text-xl text-white">DGC Bank Locked</h2>
                    <p className="text-sm text-muted-foreground mt-1">Enter your bank PIN to unlock. Session lasts 70 minutes.</p>
                  </div>
                  <Input
                    type="password"
                    inputMode="numeric"
                    autoFocus
                    value={bankPinInput}
                    onChange={(e) => { setBankPinInput(e.target.value.replace(/\D/g, "")); setBankPinError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") verifyBankPin(); }}
                    placeholder="••••••••"
                    className="text-center text-2xl tracking-[0.4em] font-mono h-14"
                  />
                  {bankPinError && <p className="text-sm text-red-400 font-medium">{bankPinError}</p>}
                  <Button onClick={verifyBankPin} disabled={bankPinVerifying || bankPinInput.length < 5} className="w-full h-11 gap-2">
                    {bankPinVerifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                    {bankPinVerifying ? "Verifying…" : "Unlock DGC Bank"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── BANK TAB ── */}
          {activeTab === "bank" && bankUnlocked && (
            <div className="space-y-6">
              {/* ── Header ── */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Wallet className="w-6 h-6 text-primary" /> DGC Bank
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {isOwner ? "Owner control center · Plisio live data" : "Withdrawal approvals · fraud monitor"}
                    {bankLastRefresh && (
                      <span className="ml-2 text-xs opacity-60">
                        · Refreshed {bankLastRefresh.toLocaleTimeString()}
                      </span>
                    )}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { loadBank(); loadFraudAlerts(); loadNeedsReview(); }} disabled={bankLoading} className="gap-2">
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
                    {Object.entries(bankBalances).map(([coin, info]) => {
                      const balance = parseFloat((info as any).balance ?? "0");
                      const isLive = (info as any).allowed === 1 || balance > 0;
                      return (
                        <Card key={coin} className="bg-card/80 border-border/60 hover:border-primary/30 transition-colors">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold text-sm uppercase tracking-wider text-primary">{coin}</span>
                              {isLive ? (
                                <span className="flex items-center gap-1 text-xs text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />Live</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Inactive</span>
                              )}
                            </div>
                            <p className="text-lg font-mono font-bold text-white tabular-nums">
                              {balance.toFixed(8)}
                            </p>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>


              {/* ── Live Deposits Panel ── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-green-400" /> Live Deposits
                    {pendingDeposits.filter((d: any) => d.type === "deposit" && d.status === "pending").length > 0 && (
                      <span className="bg-amber-500 text-black text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                        {pendingDeposits.filter((d: any) => d.type === "deposit" && d.status === "pending").length} PENDING
                      </span>
                    )}
                  </h3>
                  <Button size="sm" variant="ghost" onClick={() => loadBank()} disabled={bankLoading} className="h-7 text-xs gap-1">
                    <RefreshCw className={bankLoading ? "animate-spin h-3 w-3" : "h-3 w-3"} /> Refresh
                  </Button>
                </div>

                {/* All transactions stream */}
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-semibold">Recent Transactions (Live)</p>
                  {allLiveTx.length === 0 ? (
                    <Card className="border-dashed border-border/40">
                      <CardContent className="py-5 text-center text-muted-foreground text-sm">No transactions yet</CardContent>
                    </Card>
                  ) : (
                    <Card className="border-border/60">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-border/40">
                              <TableHead className="text-xs">ID</TableHead>
                              <TableHead className="text-xs">User</TableHead>
                              <TableHead className="text-xs">Type</TableHead>
                              <TableHead className="text-xs">Amount</TableHead>
                              <TableHead className="text-xs">Currency</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                              <TableHead className="text-xs">Time</TableHead>
                              <TableHead className="text-xs">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {allLiveTx.slice(0, 30).map((tx: any) => (
                              <TableRow key={tx.id} className={
                                tx.type === "deposit" && tx.status === "pending"
                                  ? "border-amber-500/20 bg-amber-950/10"
                                  : tx.status === "completed"
                                    ? "border-green-500/10 bg-green-950/5"
                                    : "border-border/30"
                              }>
                                <TableCell className="font-mono text-xs text-muted-foreground">#{tx.id}</TableCell>
                                <TableCell className="font-bold text-sm">
                                  {tx.username ? `@${tx.username}` : `#${tx.userId}`}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={`text-xs capitalize ${
                                    tx.type === "deposit" ? "border-green-500/40 text-green-400" :
                                    tx.type === "withdrawal" ? "border-amber-500/40 text-amber-400" :
                                    "border-border/40 text-muted-foreground"
                                  }`}>
                                    {tx.type === "deposit" ? "↓ deposit" : tx.type === "withdrawal" ? "↑ withdraw" : tx.type}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono font-bold">
                                  <span className={tx.type === "deposit" ? "text-green-400" : tx.type === "withdrawal" ? "text-amber-400" : ""}>
                                    {tx.type === "deposit" ? "+" : tx.type === "withdrawal" ? "-" : ""}{parseFloat(tx.amount).toFixed(2)}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">{tx.currency}</Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge className={`text-xs ${
                                    tx.status === "completed" ? "bg-green-600/20 text-green-400 border-green-500/30" :
                                    tx.status === "pending" ? "bg-amber-600/20 text-amber-400 border-amber-500/30" :
                                    tx.status === "failed" || tx.status === "declined" ? "bg-red-600/20 text-red-400 border-red-500/30" :
                                    "bg-secondary text-muted-foreground"
                                  }`} variant="outline">
                                    {tx.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                  {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : "—"}
                                </TableCell>
                                <TableCell>
                                  {tx.type === "deposit" && (
                                    <div className="flex gap-1">
                                      {tx.plisioTrackId && (
                                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" title="View Invoice"
                                          onClick={() => window.open(`https://plisio.net/invoice/${tx.plisioTrackId}`, "_blank")}>
                                          <Eye className="h-3 w-3" /> View Invoice
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                  {tx.type === "withdrawal" && tx.status === "pending" && (
                                    <div className="flex gap-1">
                                      <Button size="sm" className="bg-green-600 hover:bg-green-700 h-7 text-xs gap-1" disabled={loadingAction === `wd-approve-${tx.id}`}
                                        onClick={async () => {
                                          setLoadingAction(`wd-approve-${tx.id}`);
                                          try {
                                            await adminFetch(`/transactions/${tx.id}`, { method: "PATCH", body: JSON.stringify({ status: "completed" }) });
                                            toast({ title: "Approved", description: `TX #${tx.id} sent via Plisio` });
                                            await loadBank();
                                          } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
                                          finally { setLoadingAction(null); }
                                        }}>
                                        <CheckCircle2 className="h-3 w-3" /> Release
                                      </Button>
                                      <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={loadingAction === `wd-reject-${tx.id}`}
                                        onClick={async () => {
                                          setLoadingAction(`wd-reject-${tx.id}`);
                                          try {
                                            await adminFetch(`/transactions/${tx.id}`, { method: "PATCH", body: JSON.stringify({ status: "failed" }) });
                                            toast({ title: "Held", description: `TX #${tx.id} held, balance refunded` });
                                            await loadBank();
                                          } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
                                          finally { setLoadingAction(null); }
                                        }}>
                                        Hold
                                      </Button>
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </Card>
                  )}
                </div>
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
                                        body: JSON.stringify({ status: "failed" }),
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
                                        await adminFetch(`/transactions/${w.id}`, { method: "PATCH", body: JSON.stringify({ status: "failed" }) });
                                        toast({ title: "Rejected", description: `Balance refunded to ${w.username ?? ("TX #" + w.id)}` });
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

              {/* ── Needs Review / Reconcile ── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-orange-400" /> Needs Review
                    {needsReview.length > 0 && (
                      <span className="bg-orange-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">{needsReview.length}</span>
                    )}
                  </h3>
                  <Button size="sm" variant="ghost" onClick={loadNeedsReview} disabled={needsReviewLoading} className="h-7 text-xs gap-1">
                    <RefreshCw className={needsReviewLoading ? "animate-spin h-3 w-3" : "h-3 w-3"} /> Refresh
                  </Button>
                </div>
                {needsReview.length === 0 ? (
                  <Card className="border-dashed border-border/40">
                    <CardContent className="py-6 text-center text-sm text-green-400">
                      ✓ No withdrawals awaiting review
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <Card className="border-orange-500/30 bg-orange-950/10 mb-3">
                      <CardContent className="py-3 px-4 text-xs text-orange-200/80 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-orange-400" />
                        <span>
                          These payouts had an <strong>ambiguous outcome</strong> — they may or may not have been sent, and the user's balance is already held.
                          Check each one in your <strong>Plisio dashboard first</strong>, then resolve: <strong>Sent</strong> if it went out,
                          <strong> Cancel &amp; Refund</strong> if it did not, or <strong>Retry</strong> only after confirming it was NOT sent.
                        </span>
                      </CardContent>
                    </Card>
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
                              <TableHead className="text-xs">State</TableHead>
                              <TableHead className="text-xs">Updated</TableHead>
                              <TableHead className="text-xs">Resolve</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {needsReview.map((w: any) => (
                              <TableRow key={w.id} className="border-border/30">
                                <TableCell className="font-mono text-xs text-muted-foreground">#{w.id}</TableCell>
                                <TableCell className="font-bold text-sm">{w.username ? `@${w.username}` : `#${w.userId}`}</TableCell>
                                <TableCell className="font-mono font-bold">{parseFloat(w.amount).toFixed(8)}</TableCell>
                                <TableCell><Badge variant="outline" className="text-xs">{w.currency}</Badge></TableCell>
                                <TableCell className="font-mono text-xs max-w-[100px] truncate text-muted-foreground" title={w.address}>{w.address ?? "—"}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={`text-xs ${w.status === "needs_review" ? "text-orange-400 border-orange-500/40" : "text-blue-400 border-blue-500/40"}`}>
                                    {w.status === "needs_review" ? "Review" : "Stuck"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">{w.updatedAt ? new Date(w.updatedAt).toLocaleString() : "—"}</TableCell>
                                <TableCell>
                                  <div className="flex flex-col gap-1.5">
                                    <div className="flex gap-1.5 flex-wrap">
                                      <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" disabled={loadingAction === `plisio-${w.id}`}
                                        onClick={() => checkPlisioStatus(w)}>
                                        <Search className={loadingAction === `plisio-${w.id}` ? "animate-spin h-3 w-3" : "h-3 w-3"} /> Check Plisio
                                      </Button>
                                      <Button size="sm" className="bg-green-600 hover:bg-green-700 h-7 text-xs gap-1" disabled={loadingAction === `reconcile-${w.id}`}
                                        onClick={() => handleReconcile(w, "mark_completed")}>
                                        <CheckCircle2 className="h-3 w-3" /> Sent
                                      </Button>
                                      <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" disabled={loadingAction === `reconcile-${w.id}`}
                                        onClick={() => handleReconcile(w, "cancel_refund")}>
                                        <XCircle className="h-3 w-3" /> Cancel &amp; Refund
                                      </Button>
                                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={loadingAction === `reconcile-${w.id}`}
                                        onClick={() => handleReconcile(w, "requeue")}>
                                        <RefreshCw className="h-3 w-3" /> Retry
                                      </Button>
                                    </div>
                                    {plisioStatus[w.id] && (
                                      <span className={`text-xs ${plisioStatus[w.id].found ? (plisioStatus[w.id].sent === true ? "text-green-400" : plisioStatus[w.id].sent === false ? "text-red-400" : "text-yellow-400") : "text-muted-foreground"}`}>
                                        {plisioStatus[w.id].found
                                          ? plisioStatus[w.id].sent === true
                                            ? "✓ Plisio: payout WAS sent — use \u201CSent\u201D"
                                            : plisioStatus[w.id].sent === false
                                              ? "✗ Plisio: NOT sent — safe to Cancel & Refund / Retry"
                                              : `⏳ Plisio: ${plisioStatus[w.id].status ?? "pending"} — wait, not yet confirmed`
                                          : "? Plisio has no confirmable record — verify in your dashboard"}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </Card>
                  </>
                )}
              </div>

              {/* ── Live Invoice Feed (OWNER ONLY) ── */}
              {isOwner && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5" /> Live Plisio Invoice Feed
                  </h3>
                  <div className="flex gap-2">
                    {invoicePage > 1 && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setInvoicePage(p => Math.max(1, p - 1))}>
                        ← Newer
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setInvoicePage(p => p + 1)}>
                      Older →
                    </Button>
                    <span className="text-xs text-muted-foreground self-center">Page {invoicePage}</span>
                  </div>
                  <Button 
                    size="sm" 
                    variant="default" 
                    className="h-7 text-xs bg-green-600 hover:bg-green-700"
                    onClick={async () => {
                      if (!confirm("This will check ALL pending deposits with Plisio and retroactively credit any that were paid. Proceed?")) return;
                      try {
                        const data = await adminFetch('/bank/reconcile', { 
                          method: 'POST'
                        });
                        if (data.error) {
                          alert(`Error: ${data.error}`);
                        } else {
                          alert(`Reconciliation complete!\n\nChecked: ${data.checkedCount ?? 0}\nReconciled: ${data.reconciledCount ?? 0}\nFailed: ${data.failedCount ?? 0}`);
                          window.location.reload();
                        }
                      } catch (err) {
                        console.error("Reconciliation error:", err);
                        alert("Reconciliation failed. The server might still be processing. Please wait a moment and refresh.");
                      }
                    }}
                  >
                    Fix All Pending Deposits
                  </Button>
                </div>
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
                            <TableHead className="text-xs">User</TableHead>
                            <TableHead className="text-xs">Plisio ID</TableHead>
                            <TableHead className="text-xs">Type</TableHead>
                            <TableHead className="text-xs">Amount</TableHead>
                            <TableHead className="text-xs">Currency</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs">Date</TableHead>
                            <TableHead className="text-xs">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bankInvoices.map((inv: any) => {
                            const meta = inv.metadata ? (typeof inv.metadata === 'string' ? JSON.parse(inv.metadata) : inv.metadata) : {};
                            const received = meta.received_amount;
                            const total = meta.invoice_total_sum;
                            
                            return (
                            <TableRow key={inv.txn_id ?? inv.id} className="border-border/30">
                              <TableCell className="text-xs font-medium">
                                <div className="flex flex-col">
                                  <span>{inv.username || "Unknown"}</span>
                                  <span className="text-[10px] text-muted-foreground">ID: {inv.userId}</span>
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground max-w-[90px] truncate" title={inv.txn_id}>{inv.txn_id ?? "—"}</TableCell>
                              <TableCell><Badge variant="outline" className="text-xs capitalize">{inv.type ?? "invoice"}</Badge></TableCell>
                              <TableCell className="font-mono font-bold">
                                <div>{inv.source_amount ?? inv.amount ?? "—"}</div>
	                                {received && (
	                                  <div className="text-[10px] text-emerald-400 font-bold bg-emerald-400/10 px-1 py-0.5 rounded inline-block mt-1">
	                                    ACTUAL: {received} {inv.currency}
	                                  </div>
	                                )}
                              </TableCell>
                              <TableCell className="text-sm">{inv.source_currency ?? inv.currency ?? "—"}</TableCell>
                              <TableCell>
                                <Badge className="text-xs" variant={inv.status === "completed" ? "default" : inv.status === "pending" || inv.status === "new" ? "secondary" : "destructive"}>
                                  {inv.status ?? "unknown"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {inv.created_utc ? new Date(inv.created_utc * 1000).toLocaleString() : "—"}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-1">
                                  {inv.txn_id && (
                                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" title="View Invoice"
                                      onClick={() => window.open(`https://plisio.net/invoice/${inv.txn_id}`, "_blank")}>
                                      <Eye className="h-3 w-3" /> View
                                    </Button>
                                  )}
                                  {inv.type === "deposit" && inv.status === "pending" && (
                                    <>
                                      <Button size="sm" variant="secondary" className="h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                                        onClick={async () => {
                                          try {
                                            const res = await adminFetch('/bank/smart-sync', { 
                                              method: 'POST',
                                              body: JSON.stringify({ txId: inv.id })
                                            });
                                            if (res.success && !res.alreadyDone) {
                                              alert(res.message);
                                              window.location.reload();
                                            } else if (res.alreadyDone) {
                                              alert("This transaction was already completed.");
                                            } else {
                                              alert(`${res.message || "Sync issue"}\n\nRaw Plisio Status: ${res.plisioData?.status || 'Unknown'}\nReceived: ${res.plisioData?.received_amount || '0'}`);
                                            }
                                          } catch (err) {
                                            alert("Sync failed.");
                                          }
                                        }}>
                                        Smart Sync
                                      </Button>
                                      <Button size="sm" variant="destructive" className="h-7 text-xs gap-1 bg-red-600 hover:bg-red-700"
                                        onClick={async () => {
                                          const pid = prompt(`FORCE COMPLETE deposit #${inv.id} for user ${inv.username}?\n\nPlease paste the Plisio Invoice ID (from your dashboard) to verify:`, inv.txn_id || "");
                                          if (!pid) return;
                                          try {
                                            const res = await adminFetch(`/bank/smart-sync`, { 
                                              method: 'POST',
                                              body: JSON.stringify({ txId: inv.id, plisioId: pid })
                                            });
                                            if (res.success) {
                                              alert(res.message);
                                              window.location.reload();
                                            } else {
                                              alert(`Error: ${res.message || "Unknown error"}`);
                                            }
                                          } catch (err) {
                                            alert("Force complete failed.");
                                          }
                                        }}>
                                        Smart Force
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );})}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>
                )}
              </div>
              )}

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
                      <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Shield className="w-4 h-4 text-red-400" /> AI Fraud Settings
                        </CardTitle>
                        {settingsSaving && <span className="text-xs text-muted-foreground">Saving…</span>}
                        {settingsSaved && <span className="text-xs text-green-400">Saved ✓</span>}
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-3">
                        <div>
                          <div className="flex justify-between mb-1">
                            <span className="text-xs text-muted-foreground uppercase tracking-wider">AI Sensitivity</span>
                            <span className="text-xs font-mono font-bold text-primary">{bankSettings.aiSensitivity}%</span>
                          </div>
                          <input type="range" min={0} max={100} value={bankSettings.aiSensitivity}
                            onChange={e => setBankSettings(p => ({ ...p, aiSensitivity: +e.target.value }))}
                            onMouseUp={e => saveBankSettings({ aiSensitivity: +(e.target as HTMLInputElement).value })}
                            onTouchEnd={e => saveBankSettings({ aiSensitivity: +(e.target as HTMLInputElement).value })}
                            className="w-full accent-primary h-1.5 rounded" />
                          <p className="text-xs text-muted-foreground mt-1">Higher = more flags, lower = fewer flags. Multiplies every risk score by 0.5x–1.5x.</p>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground uppercase tracking-wider">Auto-approve under</span>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">$</span>
                            <input
                              type="number" min={0}
                              defaultValue={bankSettings.autoApproveUnder}
                              onBlur={e => {
                                const val = +e.target.value;
                                if (!isNaN(val) && val !== bankSettings.autoApproveUnder) saveBankSettings({ autoApproveUnder: val });
                              }}
                              className="w-20 bg-secondary/60 border border-border/40 rounded px-2 py-1 text-xs font-mono font-bold text-right"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground uppercase tracking-wider">Manual review over</span>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">$</span>
                            <input
                              type="number" min={0}
                              defaultValue={bankSettings.requireManualOver}
                              onBlur={e => {
                                const val = +e.target.value;
                                if (!isNaN(val) && val !== bankSettings.requireManualOver) saveBankSettings({ requireManualOver: val });
                              }}
                              className="w-20 bg-secondary/60 border border-border/40 rounded px-2 py-1 text-xs font-mono font-bold text-right"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground/70 pt-1 border-t border-border/30">
                          Withdrawals at or under "auto-approve" with low risk skip the fraud feed entirely.
                          Withdrawals over "manual review" are always flagged for owner approval.
                        </p>
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
                            { label: "New Today", value: stats?.newUsersToday ?? "—" },
                            { label: "Pending W/D", value: stats?.pendingWithdrawals ?? "—" },
                            { label: "Pending Amount", value: stats ? formatCurrency(stats.pendingWithdrawalAmount) : "—" },
                            { label: "Total Deposited", value: stats ? formatCurrency(stats.totalDeposited) : "—" },
                            { label: "Total Withdrawn", value: stats ? formatCurrency(stats.totalWithdrawn) : "—" },
                            { label: "Banned Users", value: stats?.bannedUsers ?? "—" },
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

      {/* ── Tournaments Tab ── */}
      {activeTab === "tournaments" && isOwner && (
        <div className="space-y-6">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display font-black uppercase tracking-widest text-xl text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-400" /> Tournaments
              </h2>
              <p className="text-muted-foreground text-sm mt-0.5">Create and manage competitive events with prize pools</p>
            </div>
            <Button
              className="gap-2 bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
              onClick={() => { setNewTourney({ name: "", description: "", prize: "0", startAt: "", endAt: "" }); setCreateTourneyOpen(true); }}
            >
              <Plus className="w-4 h-4" /> New Tournament
            </Button>
          </div>

          {/* Tournament list */}
          {tourneyLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-24 bg-secondary/40 rounded-xl animate-pulse" />)}
            </div>
          ) : tournaments.length === 0 ? (
            <Card className="border-dashed border-border/40">
              <CardContent className="py-16 text-center">
                <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground font-medium">No tournaments yet</p>
                <p className="text-muted-foreground/60 text-sm mt-1">Create your first tournament to get started</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {tournaments.map((t: any) => {
                const statusColor = t.status === "active" ? "text-green-400 bg-green-500/10 border-green-500/30" : t.status === "upcoming" ? "text-blue-400 bg-blue-500/10 border-blue-500/30" : "text-muted-foreground bg-secondary/50 border-border/40";
                return (
                  <Card key={t.id} className="border-border/60 overflow-hidden">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusColor}`}>
                              {t.status === "active" ? "🟢 Live" : t.status === "upcoming" ? "🔵 Upcoming" : "⚫ Ended"}
                            </span>
                            <h3 className="font-bold text-white text-lg leading-tight">{t.name}</h3>
                          </div>
                          {t.description && <p className="text-muted-foreground text-sm">{t.description}</p>}
                          <div className="flex flex-wrap gap-4 text-sm">
                            <div className="flex items-center gap-1.5">
                              <Award className="w-4 h-4 text-yellow-400" />
                              <span className="font-mono font-bold text-yellow-300">{formatCurrency(t.prize)} prize pool</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Users className="w-4 h-4 text-blue-400" />
                              <span className="text-muted-foreground">{t.participants} participants</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-4 h-4 text-muted-foreground" />
                              <span className="text-muted-foreground text-xs">
                                {new Date(t.startAt).toLocaleDateString()} — {new Date(t.endAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap gap-2 shrink-0">
                          {/* View Leaderboard */}
                          <Button size="sm" variant="outline" className="h-8 text-xs gap-1"
                            disabled={loadingAction === `lb-${t.id}`}
                            onClick={async () => {
                              setLoadingAction(`lb-${t.id}`);
                              try {
                                const data = await adminFetch(`/tournaments/${t.id}/leaderboard`);
                                setTourneyLeaderboard(data);
                              } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
                              finally { setLoadingAction(null); }
                            }}>
                            <Trophy className="w-3 h-3" /> Leaderboard
                          </Button>

                          {/* Edit */}
                          {t.status !== "ended" && (
                            <Button size="sm" variant="outline" className="h-8 text-xs gap-1"
                              onClick={() => {
                                setEditTourney(t);
                                setNewTourney({
                                  name: t.name, description: t.description ?? "",
                                  prize: String(t.prize),
                                  startAt: t.startAt.slice(0, 16),
                                  endAt: t.endAt.slice(0, 16),
                                });
                                setCreateTourneyOpen(true);
                              }}>
                              Edit
                            </Button>
                          )}

                          {/* End Now */}
                          {t.status === "active" && (
                            <Button size="sm" variant="destructive" className="h-8 text-xs gap-1"
                              disabled={loadingAction === `end-${t.id}`}
                              onClick={async () => {
                                setLoadingAction(`end-${t.id}`);
                                try {
                                  const res = await adminFetch(`/tournaments/${t.id}/end`, { method: "POST" });
                                  toast({ title: "Tournament ended", description: res.winner ? `Winner: ${res.winner.username}` : "No participants yet" });
                                  if (res.winner) {
                                    setAwardingTourney({ tournamentId: t.id, userId: res.winner.userId, username: res.winner.username, amount: String(t.prize) });
                                  }
                                  await loadTournaments();
                                } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
                                finally { setLoadingAction(null); }
                              }}>
                              End Now
                            </Button>
                          )}

                          {/* Delete */}
                          <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={loadingAction === `del-t-${t.id}`}
                            onClick={async () => {
                              if (!confirm(`Delete tournament "${t.name}"? This cannot be undone.`)) return;
                              setLoadingAction(`del-t-${t.id}`);
                              try {
                                await adminFetch(`/tournaments/${t.id}`, { method: "DELETE" });
                                toast({ title: "Tournament deleted" });
                                await loadTournaments();
                              } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
                              finally { setLoadingAction(null); }
                            }}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Leaderboard modal */}
          {tourneyLeaderboard && (
            <Dialog open={!!tourneyLeaderboard} onOpenChange={() => setTourneyLeaderboard(null)}>
              <DialogContent className="bg-card border-border/60 max-w-lg max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-yellow-400" />
                    {tourneyLeaderboard.tournament.name} — Leaderboard
                  </DialogTitle>
                  <DialogDescription>
                    Prize pool: {formatCurrency(tourneyLeaderboard.tournament.prize)} · Status: {tourneyLeaderboard.tournament.status}
                  </DialogDescription>
                </DialogHeader>
                {tourneyLeaderboard.leaderboard.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No participants yet</p>
                ) : (
                  <div className="space-y-2">
                    {tourneyLeaderboard.leaderboard.map((e: any) => (
                      <div key={e.userId} className={`flex items-center justify-between p-3 rounded-lg ${e.rank === 1 ? "bg-yellow-500/10 border border-yellow-500/30" : "bg-secondary/40"}`}>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-black text-lg w-8 text-center">
                            {e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : `#${e.rank}`}
                          </span>
                          <span className="font-bold text-white">{e.username}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm text-muted-foreground">{formatCurrency(e.score)} wagered</span>
                          {e.rank === 1 && tourneyLeaderboard.tournament.status === "ended" && (
                            <Button size="sm" className="h-7 text-xs gap-1 bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
                              disabled={loadingAction === `award-${e.userId}`}
                              onClick={() => setAwardingTourney({ tournamentId: tourneyLeaderboard.tournament.id, userId: e.userId, username: e.username, amount: String(tourneyLeaderboard.tournament.prize) })}>
                              <Award className="w-3 h-3" /> Award Prize
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DialogContent>
            </Dialog>
          )}

          {/* Award prize confirm modal */}
          {awardingTourney && (
            <Dialog open={!!awardingTourney} onOpenChange={() => setAwardingTourney(null)}>
              <DialogContent className="bg-card border-border/60 max-w-sm">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-yellow-400">
                    <Award className="w-5 h-5" /> Award Tournament Prize
                  </DialogTitle>
                  <DialogDescription>
                    Credit the prize to the winner's balance. This action creates a transaction record.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Winner</span>
                      <span className="font-bold text-white">@{awardingTourney.username}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Prize amount</span>
                      <span className="font-mono font-bold text-yellow-300">{formatCurrency(parseFloat(awardingTourney.amount))}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Override Amount ($)</label>
                    <Input
                      type="number"
                      value={awardingTourney.amount}
                      onChange={e => setAwardingTourney(prev => prev ? { ...prev, amount: e.target.value } : null)}
                      className="bg-secondary border-border/60"
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setAwardingTourney(null)}>Cancel</Button>
                  <Button
                    className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-bold gap-1"
                    disabled={loadingAction === `award-${awardingTourney.userId}`}
                    onClick={async () => {
                      if (!awardingTourney) return;
                      const amt = parseFloat(awardingTourney.amount);
                      if (isNaN(amt) || amt <= 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
                      setLoadingAction(`award-${awardingTourney.userId}`);
                      try {
                        const res = await adminFetch(`/tournaments/${awardingTourney.tournamentId}/award`, {
                          method: "POST",
                          body: JSON.stringify({ userId: awardingTourney.userId, amount: amt }),
                        });
                        toast({ title: "Prize awarded!", description: `${formatCurrency(res.amount)} credited to @${res.username}` });
                        setAwardingTourney(null);
                        setTourneyLeaderboard(null);
                        await loadTournaments();
                      } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
                      finally { setLoadingAction(null); }
                    }}>
                    <Award className="w-4 h-4" /> Confirm & Award
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
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

              {/* ── Account / Compliance ── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Account Type", value: selectedUser.user.accountType ?? "—" },
                  { label: "Withdrawals", value: selectedUser.user.withdrawalsEnabled === false ? "Disabled" : "Enabled" },
                  { label: "Total Deposited", value: selectedUser.user.totalDeposited != null ? formatCurrency(selectedUser.user.totalDeposited) : "—" },
                  { label: "Total Wagered", value: selectedUser.user.totalWageredAmount != null ? formatCurrency(selectedUser.user.totalWageredAmount) : "—" },
                ].map((s) => (
                  <div key={s.label} className="bg-secondary/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{s.label}</p>
                    <p className="font-mono font-bold text-sm">{String(s.value)}</p>
                  </div>
                ))}
              </div>

              {/* ── Location & Device (all collected compliance data) ── */}
              <div>
                <h4 className="font-bold uppercase tracking-wider text-sm mb-3 text-muted-foreground flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5" /> Location &amp; Device
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 bg-secondary/30 rounded-lg p-4">
                  {[
                    { label: "IP Address", value: selectedUser.user.geoIp },
                    { label: "Location Verified", value: selectedUser.user.locationVerified ? "Yes" : "No" },
                    { label: "Country", value: [selectedUser.user.geoCountry, selectedUser.user.geoCountryCode ? `(${selectedUser.user.geoCountryCode})` : ""].filter(Boolean).join(" ") },
                    { label: "Region", value: selectedUser.user.geoRegion },
                    { label: "City", value: selectedUser.user.geoCity },
                    { label: "Coordinates", value: selectedUser.user.geoLat && selectedUser.user.geoLon ? `${selectedUser.user.geoLat}, ${selectedUser.user.geoLon}` : "" },
                    { label: "Timezone", value: selectedUser.user.geoTimezone },
                    { label: "Hostname", value: selectedUser.user.geoHostname },
                    { label: "ASN", value: selectedUser.user.geoAsn },
                    { label: "ISP", value: selectedUser.user.geoIsp },
                    { label: "VPN", value: selectedUser.user.vpnDetected ? `Detected${selectedUser.user.vpnProvider ? ` (${selectedUser.user.vpnProvider})` : ""}` : "Not detected" },
                    { label: "Device", value: selectedUser.user.deviceName },
                    { label: "OS", value: selectedUser.user.deviceOs },
                    { label: "Browser", value: selectedUser.user.deviceBrowser },
                    { label: "Device Type", value: selectedUser.user.deviceType },
                    { label: "Fingerprint", value: selectedUser.user.deviceFingerprint },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-3 border-b border-border/20 py-1.5 last:border-0">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider shrink-0">{row.label}</span>
                      <span className="font-mono text-xs text-right truncate max-w-[60%]" title={row.value ? String(row.value) : ""}>
                        {row.value ? String(row.value) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* DGC Bank PIN — owner only, admin users only */}
              {isOwner && selectedUser.user.role === "admin" && (
                <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                        <span className="text-emerald-400 text-xs font-black">🏦</span>
                      </div>
                      <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">DGC Bank PIN</span>
                    </div>
                    <button
                      onClick={() => handleRegenPin(selectedUser.user.id)}
                      disabled={pinRegenLoading}
                      className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-400 transition-colors disabled:opacity-50"
                    >
                      {pinRegenLoading ? "Generating..." : "Generate New PIN"}
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    {pinLoading ? (
                      <div className="h-10 w-40 bg-secondary animate-pulse rounded-lg" />
                    ) : adminPin ? (
                      <div className="flex-1 bg-black/40 border border-emerald-500/20 rounded-lg px-4 py-2.5 font-mono font-black text-2xl tracking-[0.4em] text-emerald-300 text-center select-all">
                        {adminPin}
                      </div>
                    ) : (
                      <div className="flex-1 text-sm text-muted-foreground font-mono text-center py-2">No PIN assigned — promote user to admin to generate</div>
                    )}
                  </div>
                  <p className="text-xs text-emerald-700 font-medium">Share this PIN with the admin. They enter it when accessing DGC Bank from the header.</p>
                </div>
              )}

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

      {/* ── Create / Edit Tournament Dialog ── */}
      <Dialog open={createTourneyOpen} onOpenChange={(open) => { setCreateTourneyOpen(open); if (!open) setEditTourney(null); }}>
        <DialogContent className="bg-card border-border/60 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-400" />
              {editTourney ? "Edit Tournament" : "Create Tournament"}
            </DialogTitle>
            <DialogDescription>
              {editTourney ? "Update the tournament details below." : "Set up a new competitive event with a prize pool."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Tournament Name</label>
              <Input placeholder="e.g. Weekend Warriors" value={newTourney.name} onChange={e => setNewTourney(p => ({ ...p, name: e.target.value }))} className="bg-secondary border-border/60" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Description (optional)</label>
              <Input placeholder="Brief description shown to players" value={newTourney.description} onChange={e => setNewTourney(p => ({ ...p, description: e.target.value }))} className="bg-secondary border-border/60" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Prize Pool ($)</label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={newTourney.prize} onChange={e => setNewTourney(p => ({ ...p, prize: e.target.value }))} className="bg-secondary border-border/60" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Start Date & Time</label>
                <Input type="datetime-local" value={newTourney.startAt} onChange={e => setNewTourney(p => ({ ...p, startAt: e.target.value }))} className="bg-secondary border-border/60 text-xs" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">End Date & Time</label>
                <Input type="datetime-local" value={newTourney.endAt} onChange={e => setNewTourney(p => ({ ...p, endAt: e.target.value }))} className="bg-secondary border-border/60 text-xs" />
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => { setCreateTourneyOpen(false); setEditTourney(null); }}>Cancel</Button>
            <Button
              className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-bold gap-1"
              disabled={loadingAction === "save-tourney"}
              onClick={async () => {
                if (!newTourney.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
                if (!newTourney.startAt || !newTourney.endAt) { toast({ title: "Start and end dates required", variant: "destructive" }); return; }
                if (new Date(newTourney.endAt) <= new Date(newTourney.startAt)) { toast({ title: "End must be after start", variant: "destructive" }); return; }
                setLoadingAction("save-tourney");
                try {
                  const body = { name: newTourney.name.trim(), description: newTourney.description, prize: parseFloat(newTourney.prize) || 0, startAt: new Date(newTourney.startAt).toISOString(), endAt: new Date(newTourney.endAt).toISOString() };
                  if (editTourney) {
                    await adminFetch(`/tournaments/${editTourney.id}`, { method: "PATCH", body: JSON.stringify(body) });
                    toast({ title: "Tournament updated" });
                  } else {
                    await adminFetch("/tournaments", { method: "POST", body: JSON.stringify(body) });
                    toast({ title: "Tournament created!" });
                  }
                  setCreateTourneyOpen(false);
                  setEditTourney(null);
                  await loadTournaments();
                } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
                finally { setLoadingAction(null); }
              }}>
              {loadingAction === "save-tourney" ? "Saving…" : editTourney ? "Save Changes" : "Create Tournament"}
            </Button>
          </div>
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
                {(isOwner ? ["player", "admin"] : ["player"]).map(r => (
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

      {/* ── Chat & Messaging Tab ── */}
      {activeTab === "chat" && (
        <div className="space-y-4">
          {/* Header + Mode Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-display font-black uppercase tracking-widest text-xl flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-400" /> Chat & Messages
              </h2>
              <p className="text-muted-foreground text-sm mt-0.5">Admin group chat · DMs · Broadcast to creators</p>
            </div>
            <div className="flex gap-1 bg-secondary/50 rounded-lg p-1 border border-border/40">
              {(["group", "direct", "broadcast"] as const).map(mode => (
                <button key={mode} onClick={() => { setChatMode(mode); setSelectedRecipient(null); setUnreadChatCount(0); }}
                  className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all ${
                    chatMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  {mode === "group" ? "🟣 Group" : mode === "direct" ? "💬 Direct" : "📣 Broadcast"}
                </button>
              ))}
            </div>
          </div>

          {/* ── GROUP CHAT ── */}
          {chatMode === "group" && (
            <div className="flex flex-col h-[560px] max-h-[70vh]">
              <div className="flex-1 overflow-y-auto space-y-2 rounded-xl border border-border/40 bg-secondary/20 p-4 mb-4">
                {chatMessages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground text-sm font-mono">No messages yet. Say something!</p>
                  </div>
                ) : chatMessages.map((msg: any) => {
                  const isSelf = msg.userId === user?.id;
                  const isOwnerMsg = msg.role === "owner";
                  return (
                    <div key={msg.id} className={`flex gap-2 ${isSelf ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] ${isSelf ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                        <div className={`flex items-center gap-1.5 text-[10px] font-mono ${isSelf ? "flex-row-reverse" : ""}`}>
                          <span className={`font-bold uppercase ${isOwnerMsg ? "text-yellow-400" : "text-purple-400"}`}>{msg.username}</span>
                          <span className="text-muted-foreground">{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <div className={`group relative flex items-start gap-1 ${isSelf ? "flex-row-reverse" : ""}`}>
                          <div className={`rounded-2xl px-3 py-2 text-sm break-words ${
                            isSelf ? "bg-primary text-primary-foreground rounded-tr-sm"
                              : isOwnerMsg ? "bg-yellow-500/15 border border-yellow-500/30 text-foreground rounded-tl-sm"
                              : "bg-secondary border border-border/60 text-foreground rounded-tl-sm"
                          }`}>{msg.message}</div>
                          {isOwner && (
                            <button onClick={async () => { try { await adminFetch(`/chat/${msg.id}`, { method: "DELETE" }); setChatMessages(p => p.filter(m => m.id !== msg.id)); } catch {} }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-muted-foreground hover:text-destructive mt-1">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatBottomRef} />
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const msg = chatInput.trim();
                if (!msg) return;
                setChatSending(true);
                try { await adminFetch("/chat", { method: "POST", body: JSON.stringify({ message: msg }) }); setChatInput(""); await loadChat(); }
                catch {} finally { setChatSending(false); }
              }} className="flex gap-2">
                <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message…" maxLength={1000}
                  className="flex-1 rounded-xl border border-border/60 bg-secondary/60 px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-primary/60 transition-colors" />
                <Button type="submit" disabled={chatSending || !chatInput.trim()} className="gap-2">
                  <Send className="w-4 h-4" />Send
                </Button>
              </form>
            </div>
          )}

          {/* ── DIRECT MESSAGES ── */}
          {chatMode === "direct" && (
            <div className="flex gap-4 h-[560px]">
              {/* Recipient sidebar */}
              <div className="w-56 flex-shrink-0 flex flex-col gap-1 overflow-y-auto rounded-xl border border-border/40 bg-secondary/20 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">Admins</p>
                {recipients.admins.length === 0 && (
                  <p className="text-xs text-muted-foreground font-mono px-1">No other admins</p>
                )}
                {recipients.admins.map((a: any) => (
                  <button key={a.id} onClick={() => setSelectedRecipient({ id: a.id, username: a.username, type: "admin" })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-colors text-left ${selectedRecipient?.id === a.id ? "bg-primary/20 border border-primary/30 text-primary" : "hover:bg-secondary border border-transparent text-foreground"}`}>
                    <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xs text-amber-400 font-black flex-shrink-0">
                      {a.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate">{a.username}</span>
                  </button>
                ))}
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-3 mb-2 px-1">Creators</p>
                {recipients.creators.length === 0 && (
                  <p className="text-xs text-muted-foreground font-mono px-1">No creators yet</p>
                )}
                {recipients.creators.map((c: any) => (
                  <button key={c.id} onClick={() => setSelectedRecipient({ id: c.id, username: c.username, type: "creator" })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-colors text-left ${selectedRecipient?.id === c.id ? "bg-primary/20 border border-primary/30 text-primary" : "hover:bg-secondary border border-transparent text-foreground"}`}>
                    <div className="w-7 h-7 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-xs text-purple-400 font-black flex-shrink-0">
                      {c.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate">{c.username}</span>
                  </button>
                ))}
              </div>

              {/* Conversation */}
              <div className="flex-1 flex flex-col">
                {!selectedRecipient ? (
                  <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-border/40">
                    <div className="text-center text-muted-foreground">
                      <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm font-mono">Select a person to message</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/40">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${selectedRecipient.type === "admin" ? "bg-amber-500/20 text-amber-400" : "bg-purple-500/20 text-purple-400"}`}>
                        {selectedRecipient.username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-sm">{selectedRecipient.username}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{selectedRecipient.type === "creator" ? "Creator" : "Admin"}</p>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-2 rounded-xl border border-border/40 bg-secondary/20 p-4 mb-3">
                      {dmMessages.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                          <p className="text-muted-foreground text-sm font-mono">No messages yet. Start the conversation!</p>
                        </div>
                      ) : dmMessages.map((msg: any) => {
                        const isSelf = msg.senderId === user?.id;
                        const isOwnerMsg = msg.senderRole === "owner";
                        return (
                          <div key={msg.id} className={`flex ${isSelf ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[75%] flex flex-col gap-0.5 ${isSelf ? "items-end" : "items-start"}`}>
                              <div className={`flex items-center gap-1.5 text-[10px] font-mono ${isSelf ? "flex-row-reverse" : ""}`}>
                                <span className={`font-bold uppercase ${isOwnerMsg ? "text-yellow-400" : "text-purple-400"}`}>{msg.senderUsername}</span>
                                <span className="text-muted-foreground">{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                              </div>
                              <div className={`group relative flex items-start gap-1 ${isSelf ? "flex-row-reverse" : ""}`}>
                                <div className={`rounded-2xl px-3 py-2 text-sm break-words ${isSelf ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-secondary border border-border/60 text-foreground rounded-tl-sm"}`}>
                                  {msg.message}
                                </div>
                                {isOwner && (
                                  <button onClick={async () => { try { await adminFetch(`/messages/${msg.id}`, { method: "DELETE" }); setDmMessages(p => p.filter(m => m.id !== msg.id)); } catch {} }}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-muted-foreground hover:text-destructive mt-1">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      const msg = msgInput.trim();
                      if (!msg || !selectedRecipient) return;
                      setMsgSending(true);
                      try {
                        await adminFetch("/messages", { method: "POST", body: JSON.stringify({ recipientType: "direct", recipientId: selectedRecipient.id, message: msg }) });
                        setMsgInput("");
                        const d = await adminFetch(`/messages?recipientType=direct&recipientId=${selectedRecipient.id}`);
                        if (d.messages) setDmMessages(d.messages);
                      } catch {} finally { setMsgSending(false); }
                    }} className="flex gap-2">
                      <input type="text" value={msgInput} onChange={e => setMsgInput(e.target.value)} placeholder={`Message @${selectedRecipient.username}…`} maxLength={2000}
                        className="flex-1 rounded-xl border border-border/60 bg-secondary/60 px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-primary/60 transition-colors" />
                      <Button type="submit" disabled={msgSending || !msgInput.trim()} className="gap-2">
                        <Send className="w-4 h-4" />Send
                      </Button>
                    </form>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── BROADCAST ── */}
          {chatMode === "broadcast" && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                {(["broadcast_all", "broadcast_creators", "broadcast_admins"] as const).map(t => (
                  <button key={t} onClick={() => setBroadcastType(t)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-colors ${
                      broadcastType === t ? "bg-primary/20 border-primary/40 text-primary" : "border-border/40 bg-secondary/30 text-muted-foreground hover:text-foreground"
                    }`}>
                    {t === "broadcast_all" ? "📣 Everyone (Admins + Creators)" : t === "broadcast_creators" ? "🎬 All Creators" : "🛡️ All Admins"}
                  </button>
                ))}
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                const msg = msgInput.trim();
                if (!msg) return;
                setMsgSending(true);
                try {
                  await adminFetch("/messages", { method: "POST", body: JSON.stringify({ recipientType: broadcastType, message: msg }) });
                  setMsgInput("");
                  const d = await adminFetch(`/messages?recipientType=${broadcastType}`);
                  if (d.messages) setBroadcastMessages(d.messages);
                  toast({ title: "Broadcast sent!", description: `Message sent to ${broadcastType === "broadcast_all" ? "everyone" : broadcastType === "broadcast_creators" ? "all creators" : "all admins"}.` });
                } catch {} finally { setMsgSending(false); }
              }} className="flex gap-2">
                <input type="text" value={msgInput} onChange={e => setMsgInput(e.target.value)}
                  placeholder={`Broadcast to ${broadcastType === "broadcast_all" ? "everyone" : broadcastType === "broadcast_creators" ? "all creators" : "all admins"}…`}
                  maxLength={2000}
                  className="flex-1 rounded-xl border border-border/60 bg-secondary/60 px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-primary/60 transition-colors" />
                <Button type="submit" disabled={msgSending || !msgInput.trim()} className="gap-2 bg-purple-600 hover:bg-purple-500">
                  <Send className="w-4 h-4" />Broadcast
                </Button>
              </form>

              <div className="space-y-2 max-h-[360px] overflow-y-auto">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Sent Broadcasts</p>
                {broadcastMessages.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm font-mono border border-dashed border-border rounded-xl">No broadcasts sent yet.</div>
                ) : broadcastMessages.map((msg: any) => (
                  <div key={msg.id} className="flex items-start gap-3 p-3 rounded-xl border border-border/40 bg-secondary/20">
                    <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-black text-sm ${msg.senderRole === "owner" ? "bg-yellow-500/20 text-yellow-400" : "bg-purple-500/20 text-purple-400"}`}>
                      {msg.senderUsername.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`font-bold text-xs uppercase ${msg.senderRole === "owner" ? "text-yellow-400" : "text-purple-400"}`}>{msg.senderUsername}</span>
                        <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground uppercase font-bold">
                          {msg.recipientType === "broadcast_all" ? "All" : msg.recipientType === "broadcast_creators" ? "Creators" : "Admins"}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono ml-auto">{new Date(msg.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <p className="text-sm leading-relaxed">{msg.message}</p>
                    </div>
                    {isOwner && (
                      <button onClick={async () => { try { await adminFetch(`/messages/${msg.id}`, { method: "DELETE" }); setBroadcastMessages(p => p.filter(m => m.id !== msg.id)); } catch {} }}
                        className="opacity-60 hover:opacity-100 transition-opacity p-1 rounded text-muted-foreground hover:text-destructive flex-shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
