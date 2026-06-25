import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, useParams } from "wouter";
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
  ShieldAlert,
  List,
  Ban,
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  RefreshCw,
  RotateCcw,
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
  Bot,
  Database,
  GitBranch,
  Rocket,
  Star,
  Layers,
  ToggleLeft,
  ToggleRight,
  Pencil,
  Save,
  X,
  ScrollText,
  ChevronLeft,
  ChevronRight,
  Filter,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { OwnerAiChat } from "@/components/owner/owner-ai-chat";
import { DGCBankDashboard } from "@/components/admin/dgc-bank-dashboard";
import { VisitorLogs } from "@/components/admin/visitor-logs";

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

function payoutReadinessLabel(readiness: any): { text: string; className: string; blocksApproval: boolean } {
  if (!readiness) {
    return { text: "Checking...", className: "text-muted-foreground", blocksApproval: false };
  }
  if (readiness.ok === true) {
    const available = readiness.availableCrypto == null
      ? "balance unknown"
      : `${Number(readiness.availableCrypto).toFixed(8)} ${readiness.currency}`;
    return { text: `Ready (${available})`, className: "text-green-400", blocksApproval: false };
  }
  if (readiness.reason === "insufficient_provider_funds") {
    const available = readiness.availableCrypto == null ? "unknown" : Number(readiness.availableCrypto).toFixed(8);
    return {
      text: `Provider low: need ${Number(readiness.requiredCrypto).toFixed(8)} ${readiness.currency}, have ${available}`,
      className: "text-red-400",
      blocksApproval: true,
    };
  }
  if (readiness.reason === "no_key") {
    return { text: "Plisio key missing", className: "text-red-400", blocksApproval: true };
  }
  if (readiness.reason === "conversion_failed") {
    return { text: "Rate unavailable", className: "text-yellow-400", blocksApproval: true };
  }
  return { text: readiness.message ?? "Provider status unavailable", className: "text-yellow-400", blocksApproval: false };
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
  deviceHistory: {
    id: number;
    fingerprint: string | null;
    deviceName: string | null;
    deviceOs: string | null;
    deviceBrowser: string | null;
    deviceType: string | null;
    ip: string | null;
    country: string | null;
    city: string | null;
    vpnDetected: boolean | null;
    vpnProvider: string | null;
    firstSeen: string;
    lastSeen: string;
    loginCount: number;
  }[];
  bets: { id: number; gameId: number; amount: number; payout: number; outcome: string; createdAt: string }[];
  transactions: { id: number; type: string; amount: number; currency: string; status: string; address: string | null; createdAt: string }[];
}

type TabKey = "overview" | "users" | "transactions" | "bank" | "bank-dashboard" | "visitor-logs" | "tournaments" | "chat" | "ai" | "creators" | "slot-themes" | "audit-logs";

export default function AdminDashboard() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const routeParams = useParams<{ tab?: string }>();
  const { toast } = useToast();

  // Derive active tab from URL — /admin/:tab preserves on reload
  const validTabs: TabKey[] = ["overview", "users", "transactions", "bank", "bank-dashboard", "visitor-logs", "tournaments", "chat", "ai", "creators", "slot-themes", "audit-logs"];
  const urlTab = routeParams.tab && validTabs.includes(routeParams.tab as TabKey) ? (routeParams.tab as TabKey) : "overview";
  const [activeTab, setActiveTab] = useState<TabKey>(urlTab);

  // Navigate to tab and update URL
  const navigateToTab = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    setLocation(tab === "overview" ? "/admin" : `/admin/${tab}`);
  }, [setLocation]);

  // Sync tab when URL changes (e.g. browser back/forward)
  useEffect(() => {
    const newTab = routeParams.tab && validTabs.includes(routeParams.tab as TabKey) ? (routeParams.tab as TabKey) : "overview";
    setActiveTab(newTab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeParams.tab]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersLimit, setUsersLimit] = useState(15);
  const [txList, setTxList] = useState<AdminTx[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const [txLimit, setTxLimit] = useState(15);
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
  const [createCreatorOpen, setCreateCreatorOpen] = useState(false);
  const [newCreator, setNewCreator] = useState({
    username: "",
    password: "",
    displayName: "",
    platform: "",
    platformHandle: "",
    promoBalance: "0",
    customCommissionPct: "10",
    notes: "",
  });
  const [creatingCreator, setCreatingCreator] = useState(false);
  const [liveViewUser, setLiveViewUser] = useState<AdminUser | null>(null);
  // ── Bank state ──
  const [cryptoPrices, setCryptoPrices] = useState<Record<string, number>>({});
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
  const [creditOverrideTx, setCreditOverrideTx] = useState<any | null>(null);
  const [creditOverrideAmount, setCreditOverrideAmount] = useState("");
  const [creditOverrideLoading, setCreditOverrideLoading] = useState(false);
  const [fraudAlerts, setFraudAlerts] = useState<any[]>([]);
  const [fraudTotal, setFraudTotal] = useState(0);
  const [fraudPage, setFraudPage] = useState(1);
  const [fraudLimit, setFraudLimit] = useState(15);
  const [fraudDate, setFraudDate] = useState<string>(new Date().toISOString().split("T")[0]);
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
    signupBonus: 0,
    plisioConnected: true,
  });
  const [confirmReset, setConfirmReset] = useState<AdminUser | null>(null);
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
  // ── Creator Commission tracking ──
  const [creatorsData, setCreatorsData] = useState<any[]>([]);
  const [creatorsLoading, setCreatorsLoading] = useState(false);
  const [creatorsMonth, setCreatorsMonth] = useState<string>(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  });
  const [depositModal, setDepositModal] = useState<{ id: number; username: string; currentBalance: number } | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositNote, setDepositNote] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);

  // ── Audit Logs state ──
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [auditLogsTotal, setAuditLogsTotal] = useState(0);
  const [auditLogsPage, setAuditLogsPage] = useState(1);
  const [auditLogsSearch, setAuditLogsSearch] = useState("");
  const [auditLogsTargetType, setAuditLogsTargetType] = useState("");
  const AUDIT_LOGS_PER_PAGE = 50;

  // ── Slot Themes state ──
  const [slotThemes, setSlotThemes] = useState<any[]>([]);
  const [slotThemesLoading, setSlotThemesLoading] = useState(false);
  const [editTheme, setEditTheme] = useState<any | null>(null);
  const [editThemeName, setEditThemeName] = useState("");
  const [editThemeConfig, setEditThemeConfig] = useState("");
  const [editThemeAssets, setEditThemeAssets] = useState("");
  const [editThemeError, setEditThemeError] = useState("");
  const [editThemeSaving, setEditThemeSaving] = useState(false);
  const [createThemeOpen, setCreateThemeOpen] = useState(false);
  const [newTheme, setNewTheme] = useState({ slug: "", name: "", config: "{}", assets: "{}" });
  const [createThemeError, setCreateThemeError] = useState("");
  const [createThemeSaving, setCreateThemeSaving] = useState(false);

  const loadCreators = useCallback(async (month?: string) => {
    setCreatorsLoading(true);
    try {
      const m = month ?? creatorsMonth;
      const data = await adminFetch(`/creators?month=${m}`);
      setCreatorsData(data.creators ?? []);
    } catch {}
    finally { setCreatorsLoading(false); }
  }, [creatorsMonth]);

  const loadSlotThemes = useCallback(async () => {
    setSlotThemesLoading(true);
    try {
      const data = await adminFetch("/slots/themes");
      setSlotThemes(data.themes ?? []);
    } catch (err: any) {
      toast({ title: "Slot Themes error", description: err.message, variant: "destructive" });
    } finally {
      setSlotThemesLoading(false);
    }
  }, [toast]);

  const loadAuditLogs = useCallback(async (page = auditLogsPage, search = auditLogsSearch, targetType = auditLogsTargetType) => {
    setAuditLogsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(AUDIT_LOGS_PER_PAGE),
        ...(search ? { action: search } : {}),
        ...(targetType ? { targetType } : {}),
      });
      const data = await adminFetch(`/audit-logs?${params}`);
      setAuditLogs(data.logs ?? []);
      setAuditLogsTotal(data.pagination?.total ?? 0);
      setAuditLogsPage(page);
    } catch (err: any) {
      toast({ title: "Audit Logs error", description: err.message, variant: "destructive" });
    } finally {
      setAuditLogsLoading(false);
    }
  }, [auditLogsPage, auditLogsSearch, auditLogsTargetType, toast]);

  const handleToggleTheme = async (theme: any) => {
    const newActive = theme.active === "true" ? "false" : "true";
    try {
      await adminFetch(`/slots/themes/${theme.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: newActive === "true" }),
      });
      setSlotThemes((prev) => prev.map((t) => t.id === theme.id ? { ...t, active: newActive } : t));
      toast({ title: newActive === "true" ? "Theme activated" : "Theme deactivated", description: theme.name });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const openEditTheme = (theme: any) => {
    setEditTheme(theme);
    setEditThemeName(theme.name);
    setEditThemeConfig(JSON.stringify(theme.config, null, 2));
    setEditThemeAssets(JSON.stringify(theme.assets, null, 2));
    setEditThemeError("");
  };

  const handleSaveTheme = async () => {
    if (!editTheme) return;
    let config: any, assets: any;
    try { config = JSON.parse(editThemeConfig); } catch { setEditThemeError("Config is not valid JSON"); return; }
    try { assets = JSON.parse(editThemeAssets); } catch { setEditThemeError("Assets is not valid JSON"); return; }
    setEditThemeSaving(true);
    setEditThemeError("");
    try {
      const res = await adminFetch(`/slots/themes/${editTheme.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editThemeName, config, assets }),
      });
      setSlotThemes((prev) => prev.map((t) => t.id === editTheme.id ? res.theme : t));
      setEditTheme(null);
      toast({ title: "Theme saved", description: editThemeName });
    } catch (e: any) {
      setEditThemeError(e.message);
    } finally {
      setEditThemeSaving(false);
    }
  };

  const handleCreateTheme = async () => {
    if (!newTheme.slug || !newTheme.name) { setCreateThemeError("Slug and name are required"); return; }
    let config: any, assets: any;
    try { config = JSON.parse(newTheme.config); } catch { setCreateThemeError("Config is not valid JSON"); return; }
    try { assets = JSON.parse(newTheme.assets); } catch { setCreateThemeError("Assets is not valid JSON"); return; }
    setCreateThemeSaving(true);
    setCreateThemeError("");
    try {
      const res = await adminFetch("/slots/themes", {
        method: "POST",
        body: JSON.stringify({ slug: newTheme.slug, name: newTheme.name, config, assets }),
      });
      setSlotThemes((prev) => [res.theme, ...prev]);
      setCreateThemeOpen(false);
      setNewTheme({ slug: "", name: "", config: "{}", assets: "{}" });
      toast({ title: "Theme created", description: newTheme.name });
    } catch (e: any) {
      setCreateThemeError(e.message);
    } finally {
      setCreateThemeSaving(false);
    }
  };

  const handleCreatorDeposit = async () => {
    if (!depositModal) return;
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) return;
    setDepositLoading(true);
    try {
      await adminFetch(`/creators/${depositModal.id}/deposit`, {
        method: "POST",
        body: JSON.stringify({ amount: amt, note: depositNote || undefined }),
      });
      toast({ title: "Deposited!", description: `$${amt.toFixed(2)} added to @${depositModal.username}'s commission balance.` });
      setDepositModal(null);
      setDepositAmount("");
      setDepositNote("");
      loadCreators();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setDepositLoading(false);
    }
  };

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

  const isOwner = user ? ((user.username ?? "").toLowerCase() === "fanodgc" || user.role === "owner") : false;
  const isAdmin = user ? (user.role === "admin" || user.role === "owner" || isOwner) : false;

  // Owner bypass: fanodgc never needs to enter a PIN — unlock the bank automatically
  // as soon as the user object is available and confirmed to be the owner.
  useEffect(() => {
    if (isOwner && !bankUnlocked) {
      setBankUnlocked(true);
    }
  }, [isOwner, bankUnlocked]);

  // Live Tracking System
  const [liveUsers, setLiveUsers] = useState<Record<number, { page: string; lastSeen: number }>>({});
  useEffect(() => {
    if (!isAdmin) return;
    const interval = setInterval(async () => {
      try {
        const data = await adminFetch("/live-users");
        setLiveUsers(data.users || {});
      } catch (e) {}
    }, 5000);
    return () => clearInterval(interval);
  }, [isAdmin]);

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

  const handleCreateSpecialtyCreator = async () => {
    if (!newCreator.username || !newCreator.password) {
      toast({ title: "Username and password required", variant: "destructive" }); return;
    }
    setCreatingCreator(true);
    try {
      const res = await adminFetch("/create-specialty-creator", {
        method: "POST",
        body: JSON.stringify({
          username: newCreator.username,
          password: newCreator.password,
          displayName: newCreator.displayName || undefined,
          platform: newCreator.platform || undefined,
          platformHandle: newCreator.platformHandle || undefined,
          promoBalance: parseFloat(newCreator.promoBalance || "0"),
          customCommissionPct: parseFloat(newCreator.customCommissionPct || "10"),
          notes: newCreator.notes || undefined,
        }),
      });
      toast({
        title: "⭐ Creator Created",
        description: `@${newCreator.username} is now a specialty creator. Promo balance: $${newCreator.promoBalance}`,
        className: "bg-purple-900 border-purple-500",
      });
      setCreateCreatorOpen(false);
      setNewCreator({ username: "", password: "", displayName: "", platform: "", platformHandle: "", promoBalance: "0", customCommissionPct: "10", notes: "" });
      loadUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreatingCreator(false);
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
      const offset = (fraudPage - 1) * fraudLimit;
      const res = await adminFetch(`/bank/fraud-alerts?limit=${fraudLimit}&offset=${offset}&date=${fraudDate}`);
      setFraudAlerts(res.alerts ?? []);
      setFraudTotal(res.total ?? 0);
    } catch (err: any) {
      console.error("Fraud alerts fetch error:", err);
      toast({ title: "Fraud monitor error", description: err?.message ?? "Could not load fraud alerts", variant: "destructive" });
      setFraudAlerts([]);
    } finally {
      setFraudLoading(false);
    }
  }, [fraudPage, fraudLimit, fraudDate]);

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
        adminFetch("/bank/crypto-prices"),
      ];
      if (isOwner) tasks.push(adminFetch(`/bank/invoices?limit=25&page=${invoicePage}`));
      const [balR, wdR, depR, liveR, pricesR, invR] = await Promise.allSettled(tasks);

      if (balR.status === "fulfilled") setBankBalances(balR.value.balances ?? {});
      if (wdR.status === "fulfilled") setBankWithdrawals(wdR.value.withdrawals ?? []);
      if (pricesR && pricesR.status === "fulfilled") setCryptoPrices(pricesR.value.prices ?? {});
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
      if (liveR && liveR.status === "fulfilled") {
        const lv = liveR.value;
        setAllLiveTx(lv?.transactions ?? (Array.isArray(lv) ? lv : []));
      }
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
      const offset = (usersPage - 1) * usersLimit;
      const data = await adminFetch(`/users?search=${encodeURIComponent(search)}&limit=${usersLimit}&offset=${offset}`);
      setUsers(data.users);
      setUsersTotal(data.total);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingData(false);
    }
  }, [search, usersPage, usersLimit, toast]);

  const loadTransactions = useCallback(async () => {
    setLoadingData(true);
    try {
      const offset = (txPage - 1) * txLimit;
      const baseParams = txFilter === "pending" ? "status=pending&type=withdrawal" : "";
      const params = `${baseParams}${baseParams ? "&" : ""}limit=${txLimit}&offset=${offset}`;
      const data = await adminFetch(`/transactions?${params}`);
      setTxList(data.transactions);
      setTxTotal(data.total);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingData(false);
    }
  }, [txFilter, txPage, txLimit, toast]);

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

  useEffect(() => {
    if (activeTab === "creators" && isOwner) loadCreators();
  }, [activeTab, isOwner, loadCreators]);

  useEffect(() => {
    if (activeTab === "slot-themes" && isAdmin) loadSlotThemes();
  }, [activeTab, isAdmin, loadSlotThemes]);

  useEffect(() => {
    if (activeTab === "audit-logs" && isOwner) loadAuditLogs(1, auditLogsSearch, auditLogsTargetType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isOwner]);

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

  // Legacy: support /admin?tab=bank query param for backward compat (e.g. from navbar)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && validTabs.includes(t as TabKey)) {
      navigateToTab(t as TabKey);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Prevent restricted tabs for certain roles (moved from render body to avoid infinite loop)
  useEffect(() => {
    if (isOwner && activeTab === "bank-dashboard") {
      navigateToTab("bank");
    }
  }, [isOwner, activeTab, navigateToTab]);

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

  async function handleResetUser(u: AdminUser) {
    setLoadingAction(`reset-${u.id}`);
    try {
      await adminFetch(`/users/${u.id}/reset`, { method: "POST" });
      toast({ title: "✅ User Reset", description: `${u.username}'s balance and history cleared.` });
      setConfirmReset(null);
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

  // Owner: Full access (Bank, AI, Stats, etc.)
  // Regular admin: Restricted access (Fraud Monitor, Transactions, Chat)
  const TABS: { key: TabKey; label: string; icon: React.ElementType; badge?: number }[] = isOwner
    ? [
        { key: "overview", label: "Overview", icon: Activity },
        { key: "users", label: "Users", icon: Users },
        { key: "bank", label: "DGC Bank", icon: DollarSign },
        { key: "bank-dashboard", label: "Live Feed", icon: Activity },
        { key: "transactions", label: "Transactions", icon: List },
        { key: "creators", label: "Creators", icon: Star },
        { key: "tournaments", label: "Tournaments", icon: Trophy },
        { key: "slot-themes", label: "Slot Themes", icon: Layers },
        { key: "chat", label: "Chat", icon: MessageSquare, badge: unreadChatCount },
        { key: "ai", label: "Owner AI", icon: Bot },
        { key: "audit-logs", label: "Audit Logs", icon: ScrollText },
      ]
    : [
        { key: "overview", label: "Overview", icon: Activity },
        { key: "bank", label: "Fraud Monitor", icon: ShieldAlert },
        { key: "transactions", label: "Transactions", icon: List },
        { key: "chat", label: "Chat", icon: MessageSquare, badge: unreadChatCount },
      ];

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="font-display font-black text-2xl sm:text-3xl uppercase tracking-widest text-glow-shift-slow">
              {isOwner ? "Owner" : "Admin"} Panel
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
            if (activeTab === "slot-themes") loadSlotThemes();
            if (activeTab === "audit-logs") loadAuditLogs(auditLogsPage, auditLogsSearch, auditLogsTargetType);
          }}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="w-full overflow-x-auto scrollbar-hide">
        <div className="flex gap-0.5 bg-secondary/50 rounded-lg p-1 border border-border/40 min-w-max">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { navigateToTab(tab.key); if (tab.key === "bank") setNewPendingDeposits(0); }}
            title={tab.label}
            className={`relative flex items-center gap-1 px-2.5 py-2 rounded-md text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap flex-shrink-0 ${
              activeTab === tab.key
                ? "bg-primary text-primary-foreground shadow-[0_0_14px_rgba(255,215,0,0.35)]"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.key === "transactions" && stats && stats.pendingWithdrawals > 0 && (
              <span className="ml-0.5 bg-destructive text-destructive-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-mono leading-none">
                {stats.pendingWithdrawals > 9 ? "9+" : stats.pendingWithdrawals}
              </span>
            )}
            {tab.key === "bank" && newPendingDeposits > 0 && (
              <span className="ml-0.5 bg-amber-500 text-black text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-mono animate-pulse font-bold leading-none">
                {newPendingDeposits > 9 ? "9+" : newPendingDeposits}
              </span>
            )}
            {tab.key === "chat" && tab.badge != null && tab.badge > 0 && activeTab !== "chat" && (
              <span className="ml-0.5 bg-primary text-primary-foreground text-[10px] rounded-full min-w-[16px] h-4 flex items-center justify-center font-mono animate-pulse font-bold px-0.5 leading-none">
                {tab.badge > 99 ? "99+" : tab.badge}
              </span>
            )}
          </button>
        ))}
        </div>
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === "overview" && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: "Total Users", value: stats?.totalUsers ?? "—", icon: Users, color: "text-blue-400", bg: "from-blue-500/10 to-transparent", tab: "users" as TabKey, detail: "Total registered accounts on the platform." },
              { label: "Total Bets", value: stats?.totalBets ?? "—", icon: Activity, color: "text-purple-400", bg: "from-purple-500/10 to-transparent", tab: "users" as TabKey, detail: "Lifetime bets placed across all games. Click a user to see their full history." },
              { label: "Total Wagered", value: stats ? formatCurrency(stats.totalWagered) : "—", icon: TrendingUp, color: "text-green-400", bg: "from-green-500/10 to-transparent", tab: "users" as TabKey, detail: "Total USD-equivalent wagered by all players. See Users tab for per-player wager totals." },
              { 
                label: "Email Test", 
                value: "DIAGNOSTIC", 
                icon: Send, 
                color: "text-pink-400", 
                bg: "from-pink-500/10 to-transparent", 
                tab: "overview" as TabKey, 
                detail: "Click to send a test email via Resend and see the result.",
                onClick: async () => {
                  const email = prompt("Enter email to send test to:");
                  if (!email) return;
                  const emailType = prompt("Email type (welcome, login-security, deposit, withdrawal, verification, password-reset, suspicious):", "welcome");
                  if (!emailType) return;
                  try {
                    const res = await adminFetch("/test-email", {
                      method: "POST",
                      body: JSON.stringify({ email, emailType })
                    });
                    if (res.success) alert(`✅ SUCCESS: ${res.message}`);
                    else alert(`❌ FAILED: ${res.error}\n\n${res.details}`);
                  } catch (e: any) {
                    alert(`⚠️ Network Error: ${e.message}`);
                  }
                }
              },
            ].map((s) => (
              <Card
                key={s.label}
                role="button"
                tabIndex={0}
                onClick={() => s.onClick ? s.onClick() : navigateToTab(s.tab)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigateToTab(s.tab); } }}
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
                  <Button size="sm" className="mt-3 w-full" onClick={() => navigateToTab("bank")}>
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
                <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => navigateToTab("users")}>
                  Manage Users
                </Button>
              </CardContent>
            </Card>

            <Card
              role="button"
              tabIndex={0}
              onClick={() => navigateToTab("bank")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigateToTab("bank"); } }}
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
            <div className="ml-auto flex gap-2">
              {isOwner && (
                <Button size="sm" variant="outline" className="gap-1.5 font-bold uppercase tracking-wider border-purple-500/40 text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/60" onClick={() => setCreateCreatorOpen(true)}>
                  <Star className="w-3.5 h-3.5" /> + Specialty Creator
                </Button>
              )}
              <Button size="sm" className="gap-1.5 font-bold uppercase tracking-wider" onClick={() => setCreateUserOpen(true)}>
                <Shield className="w-3.5 h-3.5" /> + Create User
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border/40 overflow-x-auto">
            <Table className="min-w-[600px]">
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
                                className="h-7 w-7 hover:text-orange-400"
                                onClick={() => setConfirmReset(u)}
                                disabled={loadingAction === `reset-${u.id}`}
                                title="Reset user balance & history"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </Button>
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
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {(["pending", "all"] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={txFilter === f ? "default" : "outline"}
                  onClick={() => { setTxFilter(f); setTxPage(1); }}
                  className="uppercase tracking-wider text-xs"
                >
                  {f === "pending" ? "Pending Withdrawals" : "All Transactions"}
                </Button>
              ))}
            </div>
            <select
              value={txLimit}
              onChange={(e) => { setTxLimit(Number(e.target.value)); setTxPage(1); }}
              className="bg-secondary/50 border border-border rounded-lg px-2 py-1.5 text-xs font-mono"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="rounded-xl border border-border/40 overflow-x-auto">
            <Table className="min-w-[640px]">
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

          {txTotal > txLimit && (
            <div className="flex items-center justify-between mt-4">
              <Button
                size="sm"
                variant="outline"
                disabled={txPage <= 1}
                onClick={() => setTxPage(p => p - 1)}
                className="h-8 text-xs"
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground font-mono">
                Page {txPage} of {Math.ceil(txTotal / txLimit)}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={txPage >= Math.ceil(txTotal / txLimit)}
                onClick={() => setTxPage(p => p + 1)}
                className="h-8 text-xs"
              >
                Next
              </Button>
            </div>
          )}
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
                    {isOwner ? "Owner control center · DGC platform ops" : "Withdrawal approvals · fraud monitor"}
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
                        <Table className="min-w-[700px]">
                          <TableHeader>
                            <TableRow className="border-border/40">
                              <TableHead className="text-xs">ID</TableHead>
                              <TableHead className="text-xs">User</TableHead>
                              <TableHead className="text-xs">Type</TableHead>
                              <TableHead className="text-xs">Amount (USD)</TableHead>
                              <TableHead className="text-xs">Currency</TableHead>
                              <TableHead className="text-xs">Live Rate</TableHead>
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
                                <TableCell className="font-mono text-xs text-muted-foreground">
                                  <button
                                    className="hover:text-primary hover:underline transition-colors cursor-pointer"
                                    onClick={() => {
                                      navigator.clipboard.writeText(String(tx.id));
                                      toast({ title: "Copied", description: `TX ID #${tx.id} copied to clipboard` });
                                    }}
                                    title="Click to copy ID"
                                  >#{tx.id}</button>
                                </TableCell>
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
                                  <div>
                                    <span className={tx.type === "deposit" ? "text-green-400" : tx.type === "withdrawal" ? "text-amber-400" : ""}>
                                      {tx.type === "deposit" ? "+" : tx.type === "withdrawal" ? "-" : ""}{formatCurrency(parseFloat(tx.amount))}
                                    </span>
                                    {(() => {
                                      try {
                                        const meta = tx.metadata ? JSON.parse(tx.metadata) : null;
                                        const cryptoAmt = meta?.expected_crypto || meta?.received_amount;
                                        if (cryptoAmt && tx.currency && tx.currency !== "USD") {
                                          return <div className="text-xs text-muted-foreground font-mono">{parseFloat(cryptoAmt).toFixed(6)} {tx.currency}</div>;
                                        }
                                      } catch { return null; }
                                      return null;
                                    })()}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">{tx.currency}</Badge>
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {tx.currency && tx.currency !== "USD" && cryptoPrices[tx.currency] ? (
                                    <div>
                                      <span className="text-primary font-bold">${cryptoPrices[tx.currency].toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                                      <span className="flex items-center gap-1 text-green-400 text-xs mt-0.5">
                                        <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse inline-block" />
                                        live
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
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
                                    <div className="flex flex-col gap-1">
                                      {tx.plisioTrackId && (
                                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" title="View Invoice"
                                          onClick={() => window.open(`https://plisio.net/invoice/${tx.plisioTrackId}`, "_blank")}>
                                          <Eye className="h-3 w-3" /> View Invoice
                                        </Button>
                                      )}
                                      {tx.txHash && tx.currency && (() => {
                                        const EXPLORER_MAP: Record<string, (h: string) => string> = {
                                          BTC: (h) => `https://www.blockchain.com/btc/tx/${h}`,
                                          ETH: (h) => `https://etherscan.io/tx/${h}`,
                                          LTC: (h) => `https://blockchair.com/litecoin/transaction/${h}`,
                                          DOGE: (h) => `https://blockchair.com/dogecoin/transaction/${h}`,
                                          SOL: (h) => `https://solscan.io/tx/${h}`,
                                          BCH: (h) => `https://blockchair.com/bitcoin-cash/transaction/${h}`,
                                          TRX: (h) => `https://tronscan.org/#/transaction/${h}`,
                                          XMR: (h) => `https://xmrchain.net/tx/${h}`,
                                          DASH: (h) => `https://blockchair.com/dash/transaction/${h}`,
                                          TON: (h) => `https://tonviewer.com/transaction/${h}`,
                                        };
                                        const builder = EXPLORER_MAP[tx.currency];
                                        if (!builder) return null;
                                        return (
                                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-blue-500/40 text-blue-400 hover:bg-blue-500/10" title="View on blockchain explorer"
                                            onClick={() => window.open(builder(tx.txHash), "_blank")}>
                                            <ExternalLink className="h-3 w-3" /> Chain
                                          </Button>
                                        );
                                      })()}
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
                <div className="flex items-center gap-3 mb-3">
                  <div className="relative flex-1">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      type="date"
                      value={fraudDate}
                      onChange={(e) => { setFraudDate(e.target.value); setFraudPage(1); }}
                      className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-border bg-secondary/50 text-xs font-mono"
                    />
                  </div>
                  <select
                    value={fraudLimit}
                    onChange={(e) => { setFraudLimit(Number(e.target.value)); setFraudPage(1); }}
                    className="bg-secondary/50 border border-border rounded-lg px-2 py-1.5 text-xs font-mono"
                  >
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={50}>50</option>
                  </select>
                </div>

                {fraudAlerts.length === 0 ? (
                  <Card className="border-dashed border-border/40">
                    <CardContent className="py-6 text-center text-sm text-green-400">
                      ✓ No flagged transactions — AI monitoring active
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
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
                
                {fraudTotal > fraudLimit && (
                  <div className="flex items-center justify-between mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={fraudPage <= 1}
                      onClick={() => setFraudPage(p => p - 1)}
                      className="h-8 text-xs"
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground font-mono">
                      Page {fraudPage} of {Math.ceil(fraudTotal / fraudLimit)}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={fraudPage >= Math.ceil(fraudTotal / fraudLimit)}
                      onClick={() => setFraudPage(p => p + 1)}
                      className="h-8 text-xs"
                    >
                      Next
                    </Button>
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
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto custom-scrollbar">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background z-10">
                          <TableRow className="border-border/40 bg-secondary/50">
                            <TableHead className="text-xs">ID</TableHead>
                            <TableHead className="text-xs">User</TableHead>
                            <TableHead className="text-xs">Amount</TableHead>
                            <TableHead className="text-xs">Currency</TableHead>
                            <TableHead className="text-xs">Provider Balance</TableHead>
                            <TableHead className="text-xs">Address</TableHead>
                            <TableHead className="text-xs">Requested</TableHead>
                            <TableHead className="text-xs">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bankWithdrawals.map((w: any) => {
                            const readiness = payoutReadinessLabel(w.payoutReadiness);
                            return (
                            <TableRow key={w.id} className="border-border/30">
                              <TableCell className="font-mono text-xs text-muted-foreground">#{w.id}</TableCell>
                              <TableCell className="font-bold text-sm">#{w.userId}</TableCell>
                              <TableCell className="font-mono font-bold">{parseFloat(w.amount).toFixed(8)}</TableCell>
                              <TableCell><Badge variant="outline" className="text-xs">{w.currency}</Badge></TableCell>
                              <TableCell className={`text-xs max-w-[220px] ${readiness.className}`}>
                                {readiness.text}
                              </TableCell>
                              <TableCell className="font-mono text-xs max-w-[100px] truncate text-muted-foreground" title={w.address}>{w.address}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{w.createdAt ? new Date(w.createdAt).toLocaleString() : "—"}</TableCell>
                              <TableCell>
                                <div className="flex gap-1.5">
                                  <Button size="sm" className="bg-green-600 hover:bg-green-700 h-7 text-xs gap-1" disabled={loadingAction === `wd-approve-${w.id}` || readiness.blocksApproval}
                                    title={readiness.blocksApproval ? readiness.text : "Approve and send via Plisio"}
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
                          );})}
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
                      <div className="overflow-x-auto max-h-[400px] overflow-y-auto custom-scrollbar">
                        <Table>
                          <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow className="border-border/40 bg-secondary/50">
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
                        alert(`Reconciliation failed: ${err instanceof Error ? err.message : String(err)}`);
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
                      <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
                        <Table>
                          <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow className="border-border/40 bg-secondary/50">
                              <TableHead className="text-xs">User</TableHead>
                              <TableHead className="text-xs">Plisio ID</TableHead>
                            <TableHead className="text-xs">Type</TableHead>
                            <TableHead className="text-xs">Invoiced (USD)</TableHead>
                            <TableHead className="text-xs">Actual Received</TableHead>
                            <TableHead className="text-xs">Currency</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs">Date</TableHead>
                            <TableHead className="text-xs">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bankInvoices.map((inv: any) => {
                            const meta = inv.metadata ? (typeof inv.metadata === 'string' ? JSON.parse(inv.metadata) : inv.metadata) : {};
                            const receivedCrypto = meta.received_amount_crypto || meta.received_amount;
                            const invoicedCrypto = meta.invoice_amount_crypto || meta.invoice_total_sum;
                            const sourceUsd = meta.requested_amount_usd || meta.source_amount || meta.source_amount_usd || inv.amount;
                            const creditedUsd = inv.amount;

                            // Extract on-chain tx hash — from column first, then metadata tx_urls array
                            let txHash: string | null = inv.txHash || null;
                            if (!txHash && meta.tx_urls) {
                              try {
                                const urls = typeof meta.tx_urls === "string" ? JSON.parse(meta.tx_urls) : meta.tx_urls;
                                if (Array.isArray(urls) && urls.length > 0) txHash = String(urls[0]);
                              } catch { /* ignore */ }
                            }

                            // Get block explorer URL for any currency
                            const getExplorerUrl = (currency: string | undefined, hash: string) => {
                              const c = (currency || "ETH").toUpperCase();
                              if (c === "BTC") return `https://blockstream.info/tx/${hash}`;
                              if (c === "LTC") return `https://blockchair.com/litecoin/transaction/${hash}`;
                              if (c === "BNB" || c === "BSC") return `https://bscscan.com/tx/${hash}`;
                              if (c === "TRX" || c === "USDT_TRX" || c === "USDC_TRX") return `https://tronscan.org/#/transaction/${hash}`;
                              if (c === "SOL" || c === "USDC_SOL" || c === "USDT_SOL") return `https://solscan.io/tx/${hash}`;
                              if (c === "MATIC" || c === "POL") return `https://polygonscan.com/tx/${hash}`;
                              if (c === "DOGE") return `https://blockchair.com/dogecoin/transaction/${hash}`;
                              if (c === "XRP") return `https://xrpscan.com/tx/${hash}`;
                              // ETH, USDT, USDC (ERC-20) and default
                              return `https://etherscan.io/tx/${hash}`;
                            };
                            
                            return (
                            <TableRow key={inv.txn_id ?? inv.id} className="border-border/30">
                              <TableCell className="text-xs font-medium">
                                <div className="flex flex-col">
                                  <span>{inv.username || "Unknown"}</span>
                                  <span className="text-[10px] text-muted-foreground">ID: {inv.userId}</span>
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground max-w-[90px]">
                                <div className="flex flex-col gap-0.5">
                                  <span className="truncate" title={inv.txn_id ?? ""}>{inv.txn_id ?? "—"}</span>
                                  {txHash && (
                                    <button
                                      onClick={() => window.open(getExplorerUrl(inv.currency, txHash!), "_blank")}
                                      className="flex items-center gap-0.5 text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors truncate text-left"
                                      title={`On-chain: ${txHash}`}
                                    >
                                      <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                                      <span className="truncate font-mono">{txHash.slice(0, 8)}…{txHash.slice(-6)}</span>
                                    </button>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell><Badge variant="outline" className="text-xs capitalize">{inv.type ?? "invoice"}</Badge></TableCell>
                              <TableCell className="font-mono text-xs">
                                <div className="flex flex-col">
                                  <span className="text-muted-foreground">${parseFloat(sourceUsd || "0").toFixed(2)}</span>
                                  {invoicedCrypto && (
                                    <span className="text-[10px] text-muted-foreground/60">{invoicedCrypto} {inv.currency}</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {inv.status === "completed" ? (() => {
                                  // Plisio-actual amounts (enriched from their API in backend)
                                  const plisioUsd = inv.plisioReceivedUsd;
                                  const plisioCrypto = inv.plisioReceivedCrypto;
                                  const credited = parseFloat(creditedUsd || "0");
                                  // Mismatch: credited != plisio actual (> 2 cent tolerance)
                                  const mismatch = plisioUsd != null && Math.abs(plisioUsd - credited) > 0.02;
                                  return (
                                    <div className="flex flex-col gap-0.5">
                                      {plisioUsd != null ? (
                                        <>
                                          <span className={mismatch ? "text-amber-400 font-bold" : "text-emerald-400 font-bold"}>
                                            ${plisioUsd.toFixed(2)}
                                            {mismatch && <span className="text-[9px] text-amber-500 ml-1">≠ credited</span>}
                                          </span>
                                          {plisioCrypto && (
                                            <span className="text-[10px] text-emerald-400/80">{plisioCrypto} {inv.currency}</span>
                                          )}
                                          {mismatch && (
                                            <span className="text-[9px] text-muted-foreground/60">credited: ${credited.toFixed(2)}</span>
                                          )}
                                        </>
                                      ) : (
                                        <>
                                          <span className="text-emerald-400 font-bold">${credited.toFixed(2)}</span>
                                          {receivedCrypto && (
                                            <span className="text-[10px] text-emerald-400/80">{receivedCrypto} {inv.currency}</span>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  );
                                })() : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm">{inv.currency ?? "—"}</TableCell>
                              <TableCell>
                                <Badge className="text-xs" variant={inv.status === "completed" ? "default" : inv.status === "pending" || inv.status === "new" ? "secondary" : "destructive"}>
                                  {inv.status ?? "unknown"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {inv.created_utc ? new Date(inv.created_utc * 1000).toLocaleString() : inv.createdAt ? new Date(inv.createdAt).toLocaleString() : "—"}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-1">
                                  {txHash && (
                                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-cyan-500/40 text-cyan-400 hover:text-cyan-300 hover:border-cyan-400/60 hover:bg-cyan-950/30" title={`View on-chain: ${txHash}`}
                                      onClick={() => window.open(getExplorerUrl(inv.currency, txHash!), "_blank")}>
                                      <ExternalLink className="h-3 w-3" /> Chain
                                    </Button>
                                  )}
                                  {inv.txn_id && (
                                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" title="View Plisio Invoice"
                                      onClick={() => window.open(`https://plisio.net/invoice/${inv.txn_id}`, "_blank")}>
                                      <Eye className="h-3 w-3" /> View
                                    </Button>
                                  )}
                                  {inv.type === "deposit" && inv.status === "completed" && (
                                    <Button size="sm" variant="outline"
                                      className="h-7 text-xs gap-1 border-yellow-500/40 text-yellow-400 hover:text-yellow-300 hover:border-yellow-400/60 hover:bg-yellow-950/30"
                                      title="Manually set exact credit amount"
                                      onClick={() => {
                                        setCreditOverrideTx(inv);
                                        setCreditOverrideAmount(parseFloat(inv.plisioReceivedUsd ?? inv.amount ?? "0").toFixed(2));
                                      }}>
                                      <Pencil className="h-3 w-3" /> Override
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
                                            alert(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
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
                                            alert(`Force complete failed: ${err instanceof Error ? err.message : String(err)}`);
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
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/30">
                          <div>
                            <span className="text-xs text-muted-foreground uppercase tracking-wider">Signup Bonus</span>
                            <p className="text-xs text-muted-foreground/60 mt-0.5">Amount credited to new accounts on registration. Set to 0 to disable.</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">$</span>
                            <input
                              type="number" min={0} step={0.01}
                              defaultValue={bankSettings.signupBonus}
                              key={bankSettings.signupBonus}
                              onBlur={e => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val) && val >= 0 && val !== bankSettings.signupBonus) saveBankSettings({ signupBonus: val });
                              }}
                              className="w-24 bg-secondary/60 border border-border/40 rounded px-2 py-1 text-xs font-mono font-bold text-right"
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
              {selectedUser?.user?.username || "User Details"}
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
                  <MapPin className="w-3.5 h-3.5" /> Location &amp; Device (Snapshot)
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

              {/* Device History — Full Audit */}
              <div>
                <h4 className="font-bold uppercase tracking-wider text-sm mb-3 text-muted-foreground flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5" /> Device History (Full Audit)
                </h4>
                <div className="bg-secondary/30 rounded-lg overflow-hidden border border-border/20">
                  <div className="overflow-x-auto max-h-64 custom-scrollbar">
                    <Table>
                      <TableHeader className="sticky top-0 bg-secondary z-10">
                        <TableRow className="border-border/40">
                          <TableHead className="text-[10px] uppercase font-bold px-3">IP / Location</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold px-3">Device / Browser</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold px-3 text-center">VPN</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold px-3 text-right">Last Seen</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedUser.deviceHistory.length === 0 ? (
                          <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground text-xs">No historical device data</TableCell></TableRow>
                        ) : (
                          selectedUser.deviceHistory.map((d) => (
                            <TableRow key={d.id} className="border-border/10 hover:bg-white/5 transition-colors">
                              <TableCell className="px-3 py-2">
                                <div className="flex flex-col">
                                  <span className="font-mono text-xs font-bold text-white">{d.ip || "—"}</span>
                                  <span className="text-[10px] text-muted-foreground">{[d.city, d.country].filter(Boolean).join(", ")}</span>
                                </div>
                              </TableCell>
                              <TableCell className="px-3 py-2">
                                <div className="flex flex-col">
                                  <span className="text-xs text-white">{d.deviceName || d.deviceType || "Unknown"}</span>
                                  <span className="text-[10px] text-muted-foreground">{[d.deviceOs, d.deviceBrowser].filter(Boolean).join(" / ")}</span>
                                </div>
                              </TableCell>
                              <TableCell className="px-3 py-2 text-center">
                                {d.vpnDetected ? (
                                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[9px] px-1.5 h-4" variant="outline">VPN</Badge>
                                ) : (
                                  <span className="text-muted-foreground text-[10px]">—</span>
                                )}
                              </TableCell>
                              <TableCell className="px-3 py-2 text-right">
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-white font-mono">{new Date(d.lastSeen).toLocaleDateString()}</span>
                                  <span className="text-[9px] text-muted-foreground font-mono">{new Date(d.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
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

      {/* ── Create Specialty Creator Dialog ── */}
      <Dialog open={createCreatorOpen} onOpenChange={setCreateCreatorOpen}>
        <DialogContent className="bg-card border-purple-500/30 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-400">
              <Star className="w-4 h-4 fill-purple-400" /> Create Specialty Creator
            </DialogTitle>
            <DialogDescription>
              Specialty creators are invited partners — famous streamers, influencers, or brand ambassadors. They get a custom setup with promo balance and negotiated commission.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Username *</label>
                <Input placeholder="username" value={newCreator.username} onChange={e => setNewCreator(p => ({ ...p, username: e.target.value }))} className="bg-secondary border-border/60" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Password *</label>
                <Input type="password" placeholder="••••••••" value={newCreator.password} onChange={e => setNewCreator(p => ({ ...p, password: e.target.value }))} className="bg-secondary border-border/60" />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Display Name</label>
              <Input placeholder="e.g. xQc, Adin Ross" value={newCreator.displayName} onChange={e => setNewCreator(p => ({ ...p, displayName: e.target.value }))} className="bg-secondary border-border/60" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Platform</label>
                <select value={newCreator.platform} onChange={e => setNewCreator(p => ({ ...p, platform: e.target.value }))}
                  className="w-full rounded-md border border-border/60 bg-secondary px-3 py-2 text-sm focus:outline-none focus:border-purple-500/50">
                  <option value="">Select…</option>
                  <option value="Twitch">Twitch</option>
                  <option value="YouTube">YouTube</option>
                  <option value="Kick">Kick</option>
                  <option value="TikTok">TikTok</option>
                  <option value="Instagram">Instagram</option>
                  <option value="X / Twitter">X / Twitter</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Handle / Channel</label>
                <Input placeholder="@handle" value={newCreator.platformHandle} onChange={e => setNewCreator(p => ({ ...p, platformHandle: e.target.value }))} className="bg-secondary border-border/60" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Starting Promo Balance ($)</label>
                <Input type="number" placeholder="0" value={newCreator.promoBalance} onChange={e => setNewCreator(p => ({ ...p, promoBalance: e.target.value }))} className="bg-secondary border-border/60" />
                <p className="text-[10px] text-muted-foreground mt-1">Non-withdrawable casino credits</p>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Commission % (custom)</label>
                <Input type="number" min={0} max={50} placeholder="10" value={newCreator.customCommissionPct} onChange={e => setNewCreator(p => ({ ...p, customCommissionPct: e.target.value }))} className="bg-secondary border-border/60" />
                <p className="text-[10px] text-muted-foreground mt-1">Monthly % of house profit</p>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Internal Notes</label>
              <textarea placeholder="Contract details, follower count, deal terms…"
                value={newCreator.notes}
                onChange={e => setNewCreator(p => ({ ...p, notes: e.target.value }))}
                rows={2}
                className="w-full rounded-md border border-border/60 bg-secondary px-3 py-2 text-sm font-mono focus:outline-none focus:border-purple-500/50 resize-none" />
            </div>
            <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20 text-xs text-purple-300/80">
              ⭐ This account will be created as <strong>accountType: creator</strong> with full Creator Hub access. You can customize their profile further after creation.
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setCreateCreatorOpen(false)}>Cancel</Button>
            <Button className="flex-1 font-bold bg-purple-600 hover:bg-purple-500 text-white" onClick={handleCreateSpecialtyCreator} disabled={creatingCreator}>
              {creatingCreator ? "Creating…" : "⭐ Create Creator"}
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


      {/* ── Creators Commission Tab ── */}
      {activeTab === "creators" && isOwner && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-display font-black uppercase tracking-widest text-xl flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-400" /> Creator Commission Tracking
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                View monthly commission earned by each creator/affiliate and manually deposit to their promo balance.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground font-mono">Month</label>
              <input
                type="month"
                value={creatorsMonth}
                onChange={e => {
                  setCreatorsMonth(e.target.value);
                  loadCreators(e.target.value);
                }}
                className="bg-secondary border border-border/60 rounded-lg px-3 py-1.5 text-sm font-mono text-foreground focus:outline-none focus:border-primary/60"
              />
              <Button variant="outline" size="sm" onClick={() => loadCreators()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Summary row */}
          {creatorsData.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: "Total Creators",
                  value: creatorsData.length,
                  color: "text-purple-400",
                  bg: "from-purple-500/10",
                },
                {
                  label: "This Month Earned",
                  value: formatCurrency(creatorsData.reduce((a, c) => a + c.monthlyCommission, 0)),
                  color: "text-green-400",
                  bg: "from-green-500/10",
                },
                {
                  label: "Lifetime Earned",
                  value: formatCurrency(creatorsData.reduce((a, c) => a + c.lifetimeCommission, 0)),
                  color: "text-yellow-400",
                  bg: "from-yellow-500/10",
                },
                {
                  label: "Total Promo Balances",
                  value: formatCurrency(creatorsData.reduce((a, c) => a + c.promoBalance, 0)),
                  color: "text-blue-400",
                  bg: "from-blue-500/10",
                },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className={`bg-gradient-to-br ${bg} to-transparent border border-border/40 rounded-xl p-4`}>
                  <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{label}</p>
                  <p className={`text-xl font-black font-mono mt-1 ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Table */}
          <div className="border border-border/40 rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40 bg-secondary/40">
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Creator</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Tier</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Active Refs</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-right">This Month</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Lifetime</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Promo Balance</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creatorsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border/20">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-secondary animate-pulse rounded" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : creatorsData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-12 font-mono">
                      No creators found. Promote users to creator status from the Users tab.
                    </TableCell>
                  </TableRow>
                ) : (
                  creatorsData.map((c) => (
                    <TableRow key={c.id} className="border-border/20 hover:bg-secondary/30 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-xs font-black text-primary">
                            {c.username[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-sm">{c.displayName || `@${c.username}`}</div>
                            {c.displayName && <div className="text-[10px] text-muted-foreground font-mono">@{c.username}</div>}
                            <div className="text-[10px] text-primary/70 font-bold uppercase tracking-tighter">
                              {c.accountType === "creator" ? (
                                <span className="flex items-center gap-1">
                                  💎 Specialty Partner {parseFloat(c.commissionPct) >= 30 ? "🏆" : "✨"}
                                </span>
                              ) : "Standard Affiliate"}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border"
                          style={{ color: c.color, borderColor: c.color + "50", backgroundColor: c.color + "15" }}
                        >
                          {c.emoji} {c.tier}
                        </span>
                        <div className="text-xs text-muted-foreground mt-0.5 font-mono">{c.commissionPct}%</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{c.activeReferrals}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-green-400 font-semibold">
                        {c.monthlyCommission > 0 ? formatCurrency(c.monthlyCommission) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-yellow-400">
                        {c.lifetimeCommission > 0 ? formatCurrency(c.lifetimeCommission) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <span className={c.promoBalance > 0 ? "text-primary font-bold" : "text-muted-foreground"}>
                          {formatCurrency(c.promoBalance)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-500 text-white text-xs h-7 px-3 font-bold"
                          onClick={() => {
                            setDepositModal({ id: c.id, username: c.username, currentBalance: c.promoBalance });
                            setDepositAmount("");
                            setDepositNote("");
                          }}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Deposit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ── DGC Bank Dashboard Tab ── */}
      {activeTab === "bank-dashboard" && (
        <DGCBankDashboard />
      )}

      {/* ── Visitor Logs Tab ── */}
      {activeTab === "visitor-logs" && (
        <VisitorLogs />
      )}

      {/* ── Slot Themes Tab ── */}
      {activeTab === "slot-themes" && isOwner && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display font-black uppercase tracking-widest text-xl flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-400" /> Slot Themes
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                Manage slot game themes — activate/deactivate, rename, or edit configs and assets.
              </p>
            </div>
            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black font-bold" onClick={() => { setCreateThemeOpen(true); setCreateThemeError(""); setNewTheme({ slug: "", name: "", config: "{}", assets: "{}" }); }}>
              <Plus className="w-4 h-4 mr-1" /> New Theme
            </Button>
          </div>

          {slotThemesLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading themes…
            </div>
          ) : slotThemes.length === 0 ? (
            <Card className="border-border/40 bg-card/50">
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Layers className="w-10 h-10 opacity-30" />
                <p className="text-sm">No slot themes in the database yet.</p>
                <p className="text-xs opacity-60">Click "New Theme" to create the first one.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border border-border/40 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40 bg-secondary/30">
                    <TableHead className="font-bold uppercase tracking-wider text-xs">ID</TableHead>
                    <TableHead className="font-bold uppercase tracking-wider text-xs">Slug</TableHead>
                    <TableHead className="font-bold uppercase tracking-wider text-xs">Name</TableHead>
                    <TableHead className="font-bold uppercase tracking-wider text-xs">Status</TableHead>
                    <TableHead className="font-bold uppercase tracking-wider text-xs">Updated</TableHead>
                    <TableHead className="font-bold uppercase tracking-wider text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slotThemes.map((theme) => (
                    <TableRow key={theme.id} className="border-border/40 hover:bg-secondary/20">
                      <TableCell className="font-mono text-xs text-muted-foreground">{theme.id}</TableCell>
                      <TableCell className="font-mono text-xs">{theme.slug}</TableCell>
                      <TableCell className="font-semibold">{theme.name}</TableCell>
                      <TableCell>
                        <Badge
                          className={theme.active === "true"
                            ? "bg-green-500/20 text-green-400 border border-green-500/30"
                            : "bg-red-500/20 text-red-400 border border-red-500/30"}
                        >
                          {theme.active === "true" ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(theme.updatedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => handleToggleTheme(theme)}
                          >
                            {theme.active === "true"
                              ? <><ToggleRight className="w-4 h-4 text-green-400" /> Deactivate</>
                              : <><ToggleLeft className="w-4 h-4 text-muted-foreground" /> Activate</>
                            }
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 border-border/40"
                            onClick={() => openEditTheme(theme)}
                          >
                            <Pencil className="w-3 h-3" /> Edit
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* ── Edit Theme Dialog ── */}
      <Dialog open={!!editTheme} onOpenChange={(open) => { if (!open) setEditTheme(null); }}>
        <DialogContent className="bg-card border-border/60 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <Pencil className="w-4 h-4" /> Edit Slot Theme
            </DialogTitle>
            <DialogDescription>
              Update the name, config (JSON), or assets (JSON) for this theme.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Theme Name</label>
              <Input
                value={editThemeName}
                onChange={(e) => setEditThemeName(e.target.value)}
                placeholder="e.g. Lucky Slots"
                className="bg-secondary/50 border-border/40"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Config (JSON)</label>
              <textarea
                value={editThemeConfig}
                onChange={(e) => setEditThemeConfig(e.target.value)}
                rows={10}
                className="w-full bg-secondary/50 border border-border/40 rounded-md p-3 text-xs font-mono resize-y text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="{}"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Assets (JSON)</label>
              <textarea
                value={editThemeAssets}
                onChange={(e) => setEditThemeAssets(e.target.value)}
                rows={6}
                className="w-full bg-secondary/50 border border-border/40 rounded-md p-3 text-xs font-mono resize-y text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="{}"
              />
            </div>
            {editThemeError && (
              <p className="text-destructive text-sm flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{editThemeError}</p>
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 border-border/40" onClick={() => setEditTheme(null)}>
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
              <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold" onClick={handleSaveTheme} disabled={editThemeSaving}>
                <Save className="w-4 h-4 mr-1" /> {editThemeSaving ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Create Theme Dialog ── */}
      <Dialog open={createThemeOpen} onOpenChange={setCreateThemeOpen}>
        <DialogContent className="bg-card border-border/60 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <Plus className="w-4 h-4" /> New Slot Theme
            </DialogTitle>
            <DialogDescription>
              Create a new slot theme with a unique slug, display name, config, and assets.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Slug</label>
                <Input
                  value={newTheme.slug}
                  onChange={(e) => setNewTheme((p) => ({ ...p, slug: e.target.value }))}
                  placeholder="e.g. lucky-slots"
                  className="bg-secondary/50 border-border/40 font-mono text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Name</label>
                <Input
                  value={newTheme.name}
                  onChange={(e) => setNewTheme((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Lucky Slots"
                  className="bg-secondary/50 border-border/40"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Config (JSON)</label>
              <textarea
                value={newTheme.config}
                onChange={(e) => setNewTheme((p) => ({ ...p, config: e.target.value }))}
                rows={10}
                className="w-full bg-secondary/50 border border-border/40 rounded-md p-3 text-xs font-mono resize-y text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="{}"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Assets (JSON)</label>
              <textarea
                value={newTheme.assets}
                onChange={(e) => setNewTheme((p) => ({ ...p, assets: e.target.value }))}
                rows={6}
                className="w-full bg-secondary/50 border border-border/40 rounded-md p-3 text-xs font-mono resize-y text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="{}"
              />
            </div>
            {createThemeError && (
              <p className="text-destructive text-sm flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{createThemeError}</p>
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 border-border/40" onClick={() => setCreateThemeOpen(false)}>
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
              <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold" onClick={handleCreateTheme} disabled={createThemeSaving}>
                <Plus className="w-4 h-4 mr-1" /> {createThemeSaving ? "Creating…" : "Create Theme"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Owner AI Tab ── */}
      {activeTab === "ai" && isOwner && (
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display font-black uppercase tracking-widest text-xl flex items-center gap-2">
                <Bot className="w-5 h-5 text-purple-400" /> DG AI
                <span className="text-xs font-mono font-normal bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30 normal-case tracking-normal">GPT-5 · Owner Only</span>
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                Your in-house platform intelligence. Connected live to Neon DB, GitHub, and Render.
                Can read &amp; write the database, manage users, push code, trigger deploys, and analyze everything.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[
              { icon: Database, label: "Neon DB", desc: "Read & Write", color: "text-blue-400" },
              { icon: GitBranch, label: "GitHub", desc: "Commit & Push", color: "text-green-400" },
              { icon: Rocket, label: "Render", desc: "Deploy Trigger", color: "text-orange-400" },
              { icon: Shield, label: "Owner Lock", desc: "Triple Verified", color: "text-purple-400" },
            ].map(({ icon: Icon, label, desc, color }) => (
              <div key={label} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
                <div>
                  <div className="font-semibold text-white">{label}</div>
                  <div className="text-gray-500">{desc}</div>
                </div>
              </div>
            ))}
          </div>
          <OwnerAiChat token={getToken()} />
        </div>
      )}
      {/* ── Creator Commission Deposit Dialog ── */}
      <Dialog open={!!depositModal} onOpenChange={(o) => { if (!o) setDepositModal(null); }}>
        <DialogContent className="bg-card border-border/60 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-400">
              <DollarSign className="w-5 h-5" />
              Deposit Commission
            </DialogTitle>
            <DialogDescription>
              Add funds to <strong>@{depositModal?.username}</strong>'s commission (promo) balance.
              Current balance: <strong>{depositModal ? formatCurrency(depositModal.currentBalance) : "—"}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1 block">Amount (USD)</label>
              <Input
                type="number"
                min="1"
                step="0.01"
                placeholder="e.g. 250.00"
                value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)}
                className="font-mono"
                autoFocus
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {[50, 100, 250, 500, 1000].map(amt => (
                <button
                  key={amt}
                  onClick={() => setDepositAmount(String(amt))}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
                    depositAmount === String(amt)
                      ? "bg-green-500/20 border-green-500/60 text-green-400"
                      : "bg-secondary border-border/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  ${amt}
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1 block">Note (optional)</label>
              <Input
                placeholder="e.g. June commission payout"
                value={depositNote}
                onChange={e => setDepositNote(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setDepositModal(null)} disabled={depositLoading}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold"
              onClick={handleCreatorDeposit}
              disabled={depositLoading || !depositAmount || parseFloat(depositAmount) <= 0}
            >
              {depositLoading ? "Depositing…" : `Deposit $${parseFloat(depositAmount || "0").toFixed(2)}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Reset User Confirm Dialog ── */}
      <Dialog open={!!confirmReset} onOpenChange={() => setConfirmReset(null)}>
        <DialogContent className="bg-card border-border/60 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-400">
              <RotateCcw className="w-5 h-5" />
              Reset User
            </DialogTitle>
            <DialogDescription>
              This will zero out <strong>{confirmReset?.username}</strong>'s balance, promo balance, vault, all bets, transactions, game sessions, and stats. Their account stays active. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmReset(null)}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => confirmReset && handleResetUser(confirmReset)}
              disabled={loadingAction === `reset-${confirmReset?.id}`}
            >
              {loadingAction === `reset-${confirmReset?.id}` ? "Resetting…" : "Reset User"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Audit Logs Tab ── */}
      {activeTab === "audit-logs" && isOwner && (
        <div className="space-y-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-display font-black uppercase tracking-widest text-xl flex items-center gap-2">
                <ScrollText className="w-5 h-5 text-violet-400" /> Audit Logs
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                Full history of every admin action — {auditLogsTotal.toLocaleString()} entries total.
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by action…"
                value={auditLogsSearch}
                onChange={e => setAuditLogsSearch(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") loadAuditLogs(1, auditLogsSearch, auditLogsTargetType); }}
                className="pl-8 h-8 text-sm bg-secondary border-border/60"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <select
                value={auditLogsTargetType}
                onChange={e => {
                  setAuditLogsTargetType(e.target.value);
                  loadAuditLogs(1, auditLogsSearch, e.target.value);
                }}
                className="h-8 rounded-md border border-border/60 bg-secondary px-2 text-sm focus:outline-none focus:border-primary/50"
              >
                <option value="">All types</option>
                <option value="user">User</option>
                <option value="transaction">Transaction</option>
                <option value="tournament">Tournament</option>
                <option value="platform">Platform</option>
                <option value="system">System</option>
              </select>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => loadAuditLogs(1, auditLogsSearch, auditLogsTargetType)}
              disabled={auditLogsLoading}
              className="h-8 text-xs"
            >
              {auditLogsLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Search"}
            </Button>
            {(auditLogsSearch || auditLogsTargetType) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAuditLogsSearch("");
                  setAuditLogsTargetType("");
                  loadAuditLogs(1, "", "");
                }}
                className="h-8 text-xs text-muted-foreground"
              >
                Clear
              </Button>
            )}
          </div>

          {/* Table */}
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50 border-border/50 hover:bg-secondary/50">
                  <TableHead className="text-xs font-bold uppercase tracking-widest text-muted-foreground w-[140px]">Time</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Admin</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Action</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Target</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-widest text-muted-foreground hidden lg:table-cell">Note</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-widest text-muted-foreground hidden xl:table-cell">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogsLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : auditLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                      {auditLogsSearch || auditLogsTargetType ? "No audit logs match your filters." : "No audit logs yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  auditLogs.map((log: any) => {
                    const targetTypeColor: Record<string, string> = {
                      user: "bg-blue-500/15 text-blue-400 border-blue-500/25",
                      transaction: "bg-green-500/15 text-green-400 border-green-500/25",
                      tournament: "bg-amber-500/15 text-amber-400 border-amber-500/25",
                      platform: "bg-violet-500/15 text-violet-400 border-violet-500/25",
                      system: "bg-rose-500/15 text-rose-400 border-rose-500/25",
                    };
                    const colorClass = targetTypeColor[log.targetType] ?? "bg-secondary text-muted-foreground border-border/40";
                    return (
                      <TableRow key={log.id} className="border-border/30 hover:bg-secondary/20 transition-colors">
                        <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString("en-US", {
                            month: "short", day: "numeric",
                            hour: "2-digit", minute: "2-digit", second: "2-digit",
                            hour12: false,
                          })}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          <span className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">
                            {log.adminUsername}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm font-mono max-w-[220px] truncate" title={log.action}>
                          {log.action}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${colorClass}`}>
                              {log.targetType}
                            </span>
                            {log.targetId != null && (
                              <span className="text-xs text-muted-foreground font-mono">#{log.targetId}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate hidden lg:table-cell" title={log.note ?? ""}>
                          {log.note || "—"}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground hidden xl:table-cell">
                          {log.ip || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {auditLogsTotal > AUDIT_LOGS_PER_PAGE && (
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-xs text-muted-foreground">
                Showing {((auditLogsPage - 1) * AUDIT_LOGS_PER_PAGE) + 1}–{Math.min(auditLogsPage * AUDIT_LOGS_PER_PAGE, auditLogsTotal)} of {auditLogsTotal.toLocaleString()} entries
              </p>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => loadAuditLogs(auditLogsPage - 1, auditLogsSearch, auditLogsTargetType)}
                  disabled={auditLogsPage <= 1 || auditLogsLoading}
                  className="h-7 w-7 p-0"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                {Array.from({ length: Math.min(7, Math.ceil(auditLogsTotal / AUDIT_LOGS_PER_PAGE)) }, (_, i) => {
                  const totalPages = Math.ceil(auditLogsTotal / AUDIT_LOGS_PER_PAGE);
                  let page: number;
                  if (totalPages <= 7) {
                    page = i + 1;
                  } else if (auditLogsPage <= 4) {
                    page = i + 1;
                  } else if (auditLogsPage >= totalPages - 3) {
                    page = totalPages - 6 + i;
                  } else {
                    page = auditLogsPage - 3 + i;
                  }
                  return (
                    <Button
                      key={page}
                      size="sm"
                      variant={auditLogsPage === page ? "default" : "outline"}
                      onClick={() => loadAuditLogs(page, auditLogsSearch, auditLogsTargetType)}
                      disabled={auditLogsLoading}
                      className="h-7 w-7 p-0 text-xs font-mono"
                    >
                      {page}
                    </Button>
                  );
                })}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => loadAuditLogs(auditLogsPage + 1, auditLogsSearch, auditLogsTargetType)}
                  disabled={auditLogsPage >= Math.ceil(auditLogsTotal / AUDIT_LOGS_PER_PAGE) || auditLogsLoading}
                  className="h-7 w-7 p-0"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Manual Credit Override Dialog ── */}
      <Dialog open={!!creditOverrideTx} onOpenChange={(o) => { if (!o) { setCreditOverrideTx(null); setCreditOverrideAmount(""); } }}>
        <DialogContent className="bg-card border-border/60 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-400">
              <Pencil className="h-4 w-4" /> Manual Credit Override
            </DialogTitle>
            <DialogDescription>
              Set the exact USD amount to credit for deposit #{creditOverrideTx?.id} ({creditOverrideTx?.username}).
              {creditOverrideTx?.plisioReceivedUsd != null && (
                <span className="block mt-1 text-emerald-400">Plisio actual: ${parseFloat(String(creditOverrideTx.plisioReceivedUsd)).toFixed(2)} {creditOverrideTx.currency}</span>
              )}
              <span className="block mt-0.5 text-muted-foreground/70">Currently credited: ${parseFloat(String(creditOverrideTx?.amount ?? "0")).toFixed(2)}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-2">
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="New credit amount in USD"
              value={creditOverrideAmount}
              onChange={(e) => setCreditOverrideAmount(e.target.value)}
              className="font-mono"
            />
            <div className="text-xs text-muted-foreground">
              {creditOverrideTx && creditOverrideAmount && !isNaN(parseFloat(creditOverrideAmount)) && (
                (() => {
                  const diff = parseFloat(creditOverrideAmount) - parseFloat(String(creditOverrideTx.amount ?? "0"));
                  return diff !== 0 ? (
                    <span className={diff > 0 ? "text-emerald-400" : "text-red-400"}>
                      Balance will {diff > 0 ? "increase" : "decrease"} by ${Math.abs(diff).toFixed(2)}
                    </span>
                  ) : <span className="text-muted-foreground">No change</span>;
                })()
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setCreditOverrideTx(null); setCreditOverrideAmount(""); }}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white"
                disabled={creditOverrideLoading || !creditOverrideAmount || isNaN(parseFloat(creditOverrideAmount))}
                onClick={async () => {
                  if (!creditOverrideTx) return;
                  const amt = parseFloat(creditOverrideAmount);
                  if (isNaN(amt) || amt < 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
                  setCreditOverrideLoading(true);
                  try {
                    const res = await adminFetch(`/transactions/${creditOverrideTx.id}/credit-override`, {
                      method: "POST",
                      body: JSON.stringify({ amount: amt, note: `Manual override by admin — Plisio actual: ${creditOverrideTx.plisioReceivedUsd ?? "unknown"}` }),
                    });
                    if (res.success) {
                      toast({ title: "Credit updated", description: `Changed from $${res.oldAmount?.toFixed(2)} → $${res.newAmount?.toFixed(2)} (Δ${res.diff >= 0 ? "+" : ""}${res.diff?.toFixed(2)})` });
                      setCreditOverrideTx(null);
                      setCreditOverrideAmount("");
                      loadBank();
                    } else {
                      toast({ title: "Override failed", description: res.error ?? "Unknown error", variant: "destructive" });
                    }
                  } catch (err: any) {
                    toast({ title: "Error", description: err.message, variant: "destructive" });
                  } finally {
                    setCreditOverrideLoading(false);
                  }
                }}
              >
                {creditOverrideLoading ? "Applying…" : "Apply Override"}
              </Button>
            </div>
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
