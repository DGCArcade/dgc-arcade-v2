/**
 * DG AI — Owner-Exclusive Intelligent Platform Assistant
 *
 * This is the most privileged endpoint in the entire DGC Arcade system.
 * It is triple-locked: JWT auth + admin role + exact username match.
 *
 * Capabilities:
 *  - Full Neon DB read/write (SELECT, UPDATE, INSERT, DELETE via Drizzle)
 *  - GitHub: commit files, push to main, check status, view diffs
 *  - Render: trigger deploys, check deploy status
 *  - Platform: manage games, settings, users, balances, tournaments
 *  - Analytics: revenue, user stats, bet history, fraud review
 *
 * Architecture: Streaming SSE agentic loop — the server handles all tool calls
 * internally and streams the final text response token-by-token to the client.
 */

import { Router } from "express";
import { requireAdmin } from "../middlewares/auth.js";
import {
  db,
  usersTable,
  transactionsTable,
  betsTable,
  gamesTable,
  platformSettingsTable,
  adminAuditLogsTable,
  fraudReviewsTable,
} from "@workspace/db";
import { eq, sql, desc, and, like } from "drizzle-orm";
import { recordLedgerStandalone } from "../services/ledger.js";
import { logger } from "../lib/logger.js";
import { execSync } from "child_process";

export const ownerAiRouter = Router();
ownerAiRouter.use(requireAdmin);

const OWNER_USERNAME = "fanodgc";
const REPO_PATH = process.env.REPO_PATH || "/app";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || "DGC4";
const GITHUB_REPO_NAME = process.env.GITHUB_REPO || "dgc-arcade-v2";

// Configure git with GitHub token for authenticated pushes on Render
function configureGit() {
  if (GITHUB_TOKEN) {
    try {
      execSync(`git -C ${REPO_PATH} config user.email "dg-ai@dgcarcade.com"`, { encoding: "utf8" });
      execSync(`git -C ${REPO_PATH} config user.name "DG AI"`, { encoding: "utf8" });
      // Set remote URL with token for authenticated push
      const remoteUrl = `https://${GITHUB_TOKEN}@github.com/${GITHUB_OWNER}/${GITHUB_REPO_NAME}.git`;
      execSync(`git -C ${REPO_PATH} remote set-url origin "${remoteUrl}"`, { encoding: "utf8" });
    } catch {
      // Non-fatal — git may not be configured in this environment
    }
  }
}

// ── Owner verification ────────────────────────────────────────────────────────

async function callerIsOwner(req: { user?: { userId: number } }): Promise<boolean> {
  if (!req.user) return false;
  const [caller] = await db
    .select({ username: usersTable.username, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, req.user.userId))
    .limit(1);
  return (
    (caller?.username ?? "").toLowerCase() === OWNER_USERNAME ||
    caller?.role === "owner"
  );
}

// ── Audit logging ─────────────────────────────────────────────────────────────

async function logAudit(
  adminId: number,
  adminUsername: string,
  action: string,
  targetType: string,
  note: string,
  targetId?: number,
  oldValue?: string,
  newValue?: string
) {
  try {
    await db.insert(adminAuditLogsTable).values({
      adminId,
      adminUsername,
      action,
      targetType,
      targetId,
      oldValue,
      newValue,
      note: `[DG AI] ${note}`,
    });
  } catch {
    // Non-fatal — audit logging should never block the main operation
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const AI_TOOLS = [
  // ── Database Tools ──────────────────────────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "run_db_query",
      description:
        "Execute a SQL query on the DGC Arcade Neon PostgreSQL database. Supports SELECT, UPDATE, INSERT, DELETE. For destructive operations, always explain what you're about to do first. Returns rows and row count.",
      parameters: {
        type: "object",
        properties: {
          sql: {
            type: "string",
            description: "The SQL query to execute. Can be SELECT, UPDATE, INSERT, or DELETE.",
          },
          confirm_destructive: {
            type: "boolean",
            description:
              "Set to true to confirm you intend to run a destructive (UPDATE/INSERT/DELETE) query. Required for non-SELECT queries.",
          },
        },
        required: ["sql"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_platform_stats",
      description:
        "Get comprehensive real-time platform statistics: total users, active users today, total bets, total wagered, total deposited, total withdrawn, revenue, biggest win, pending withdrawals, banned users, and new users today.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_all_users",
      description:
        "Get a paginated list of all users with their balances, roles, deposit totals, ban status, and registration date. Optionally search by username.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Optional: filter by username (partial match)." },
          limit: { type: "number", description: "Number of users to return (default 50, max 200)." },
          offset: { type: "number", description: "Offset for pagination (default 0)." },
          include_banned: { type: "boolean", description: "Include banned users (default true)." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_user_detail",
      description:
        "Get full details for a specific user including their recent bets, transactions, geo data, device info, and balance history.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "The username to look up." },
        },
        required: ["username"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_user_balance",
      description:
        "Set a user's balance to a specific USD amount. This is an admin override that creates a ledger entry. Use carefully.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string" },
          balance: { type: "number", description: "New balance in USD." },
          reason: { type: "string", description: "Reason for the change (logged in audit trail)." },
        },
        required: ["username", "balance", "reason"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "adjust_user_balance",
      description:
        "Add or subtract an amount from a user's balance. Use positive to add, negative to subtract.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string" },
          amount: { type: "number", description: "Amount to add (positive) or subtract (negative) in USD." },
          reason: { type: "string" },
        },
        required: ["username", "amount", "reason"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "ban_user",
      description: "Ban or unban a user by username.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string" },
          ban: { type: "boolean", description: "true to ban, false to unban." },
          reason: { type: "string", description: "Reason for the ban/unban." },
        },
        required: ["username", "ban"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_user_role",
      description: "Change a user's role. Valid roles: player, admin, creator, owner.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string" },
          role: { type: "string", enum: ["player", "admin", "creator", "owner"] },
          reason: { type: "string" },
        },
        required: ["username", "role"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_transactions",
      description:
        "Get recent transactions filtered by username, type (deposit/withdrawal), or status (pending/completed/failed/needs_review).",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string" },
          type: { type: "string", enum: ["deposit", "withdrawal"] },
          status: { type: "string", enum: ["pending", "completed", "failed", "needs_review", "processing"] },
          limit: { type: "number", description: "Default 20, max 100." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "approve_withdrawal",
      description: "Approve a pending withdrawal transaction by ID.",
      parameters: {
        type: "object",
        properties: {
          transaction_id: { type: "number" },
          note: { type: "string" },
        },
        required: ["transaction_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "reject_withdrawal",
      description: "Reject a pending withdrawal and refund the user's balance.",
      parameters: {
        type: "object",
        properties: {
          transaction_id: { type: "number" },
          reason: { type: "string" },
        },
        required: ["transaction_id", "reason"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "reconcile_all_balances",
      description:
        "Trigger a full balance reconciliation — checks all users' completed deposits against their current balance and fixes any discrepancies.",
      parameters: { type: "object", properties: {} },
    },
  },
  // ── Game Management ─────────────────────────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "get_games",
      description: "Get all games with their current settings (min/max bet, house edge, active status).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_game",
      description: "Update a game's settings: enable/disable it, change min/max bet, or adjust house edge.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Game slug (e.g. 'slots', 'dice', 'crash', 'blackjack', 'mines', 'roulette', 'plinko', 'hilo', 'keno', 'coin-flip')." },
          active: { type: "boolean" },
          min_bet: { type: "number" },
          max_bet: { type: "number" },
          house_edge: { type: "number", description: "House edge as a decimal (e.g. 0.03 = 3%)." },
        },
        required: ["slug"],
      },
    },
  },
  // ── Platform Settings ────────────────────────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "get_platform_setting",
      description: "Get a platform setting value by key.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string" },
        },
        required: ["key"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_platform_setting",
      description: "Set a platform setting key-value pair. Use this to control platform-wide flags and configuration.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string" },
          value: { type: "string" },
          reason: { type: "string" },
        },
        required: ["key", "value"],
      },
    },
  },
  // ── GitHub Integration ───────────────────────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "github_status",
      description:
        "Check the current git status of the DGC Arcade repository: current branch, uncommitted changes, and recent commit history.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "github_read_file",
      description: "Read the current content of a file in the repository.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to repo root (e.g. 'artifacts/api-server/src/routes/owner-ai.ts')." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "github_write_and_commit",
      description:
        "Write content to a file in the repository and commit + push it to GitHub. Use this to make real code changes. Always explain what you're changing and why before doing it.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to repo root." },
          content: { type: "string", description: "The full new content of the file." },
          commit_message: { type: "string", description: "Git commit message describing the change." },
        },
        required: ["path", "content", "commit_message"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "github_commit_push",
      description:
        "Stage all changed files and push a commit to GitHub. Use after making multiple file changes.",
      parameters: {
        type: "object",
        properties: {
          commit_message: { type: "string" },
        },
        required: ["commit_message"],
      },
    },
  },
  // ── Render Deployment ────────────────────────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "trigger_deploy",
      description:
        "Trigger a new deployment on Render. Since autoDeploy is enabled, pushing to GitHub automatically deploys. This tool pushes a trigger commit to force a redeploy.",
      parameters: {
        type: "object",
        properties: {
          service: {
            type: "string",
            enum: ["api", "frontend", "both"],
            description: "Which service to redeploy.",
          },
          reason: { type: "string" },
        },
        required: ["service"],
      },
    },
  },
  // ── Analytics ────────────────────────────────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "get_revenue_analytics",
      description:
        "Get revenue analytics: house profit by game, daily revenue for the past N days, top players by wagered amount, and win/loss ratios.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Number of days to analyze (default 7)." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_fraud_alerts",
      description: "Get all open fraud review cases with user details and flagged reasons.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_bet_history",
      description: "Get recent bet history, optionally filtered by username or game slug.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string" },
          game_slug: { type: "string" },
          limit: { type: "number", description: "Default 20, max 100." },
        },
      },
    },
  },
];

// ── Tool execution ────────────────────────────────────────────────────────────

async function executeToolCall(
  toolName: string,
  toolArgs: Record<string, any>,
  callerId: number,
  callerUsername: string
): Promise<{ result: string; toolName: string; success: boolean }> {
  try {
    let result: string;

    switch (toolName) {
      // ── Database ────────────────────────────────────────────────────────────

      case "run_db_query": {
        const query = (toolArgs.sql as string).trim();
        const upper = query.toUpperCase();
        const isDestructive =
          upper.startsWith("UPDATE") ||
          upper.startsWith("DELETE") ||
          upper.startsWith("INSERT") ||
          upper.startsWith("DROP") ||
          upper.startsWith("TRUNCATE") ||
          upper.startsWith("ALTER");

        if (isDestructive && !toolArgs.confirm_destructive) {
          result = JSON.stringify({
            error:
              "Destructive query requires confirm_destructive: true. Please confirm you want to run this mutation.",
          });
          break;
        }

        const raw = await db.execute(sql.raw(query)) as any;
        const rows = raw.rows || raw || [];
        result = JSON.stringify({
          rows: Array.isArray(rows) ? rows.slice(0, 500) : [],
          rowCount: Array.isArray(rows) ? rows.length : (raw.rowCount ?? 0),
          command: raw.command,
        });

        if (isDestructive) {
          await logAudit(callerId, callerUsername, "raw_sql", "database", query);
        }
        break;
      }

      case "get_platform_stats": {
        const [userStats] = await db.select({
          total: sql<number>`COUNT(*)`,
          banned: sql<number>`COUNT(*) FILTER (WHERE is_banned = true)`,
          newToday: sql<number>`COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')`,
          activeToday: sql<number>`COUNT(*) FILTER (WHERE last_login_at >= NOW() - INTERVAL '24 hours')`,
        }).from(usersTable);

        const [betStats] = await db.select({
          totalBets: sql<number>`COUNT(*)`,
          totalWagered: sql<number>`COALESCE(SUM(amount::numeric), 0)`,
          totalPayout: sql<number>`COALESCE(SUM(payout::numeric), 0)`,
          biggestWin: sql<number>`COALESCE(MAX(payout::numeric), 0)`,
        }).from(betsTable);

        const [depositStats] = await db.select({
          totalDeposited: sql<number>`COALESCE(SUM(amount::numeric), 0)`,
        }).from(transactionsTable).where(
          and(eq(transactionsTable.type, "deposit"), eq(transactionsTable.status, "completed"))
        );

        const [withdrawalStats] = await db.select({
          totalWithdrawn: sql<number>`COALESCE(SUM(amount::numeric), 0)`,
          pendingCount: sql<number>`COUNT(*) FILTER (WHERE status = 'pending')`,
          pendingAmount: sql<number>`COALESCE(SUM(amount::numeric) FILTER (WHERE status = 'pending'), 0)`,
        }).from(transactionsTable).where(eq(transactionsTable.type, "withdrawal"));

        const revenue = Number(betStats?.totalWagered ?? 0) - Number(betStats?.totalPayout ?? 0);

        result = JSON.stringify({
          users: {
            total: userStats?.total ?? 0,
            banned: userStats?.banned ?? 0,
            newToday: userStats?.newToday ?? 0,
            activeToday: userStats?.activeToday ?? 0,
          },
          bets: {
            totalBets: betStats?.totalBets ?? 0,
            totalWagered: Number(betStats?.totalWagered ?? 0).toFixed(2),
            totalPayout: Number(betStats?.totalPayout ?? 0).toFixed(2),
            biggestWin: Number(betStats?.biggestWin ?? 0).toFixed(2),
            houseRevenue: revenue.toFixed(2),
          },
          finance: {
            totalDeposited: Number(depositStats?.totalDeposited ?? 0).toFixed(2),
            totalWithdrawn: Number(withdrawalStats?.totalWithdrawn ?? 0).toFixed(2),
            pendingWithdrawals: withdrawalStats?.pendingCount ?? 0,
            pendingWithdrawalAmount: Number(withdrawalStats?.pendingAmount ?? 0).toFixed(2),
          },
        });
        break;
      }

      case "get_all_users": {
        const { search, limit = 50, offset = 0 } = toolArgs;
        const cap = Math.min(Number(limit), 200);

        const baseQ = db.select({
          id: usersTable.id,
          username: usersTable.username,
          role: usersTable.role,
          balance: usersTable.balance,
          totalDeposited: usersTable.totalDeposited,
          totalBets: usersTable.totalBets,
          isBanned: usersTable.isBanned,
          createdAt: usersTable.createdAt,
          lastLoginAt: usersTable.lastLoginAt,
        }).from(usersTable);

        let users: any[];
        if (search) {
          users = await baseQ
            .where(like(usersTable.username, `%${search}%`))
            .orderBy(desc(usersTable.createdAt))
            .limit(cap)
            .offset(Number(offset));
        } else {
          users = await baseQ
            .orderBy(desc(usersTable.createdAt))
            .limit(cap)
            .offset(Number(offset));
        }

        result = JSON.stringify({ users, count: users.length });
        break;
      }

      case "get_user_detail": {
        const { username } = toolArgs;
        const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
        if (!user) {
          result = JSON.stringify({ error: `User '${username}' not found.` });
          break;
        }

        const recentBets = await db.select({
          id: betsTable.id,
          gameId: betsTable.gameId,
          amount: betsTable.amount,
          payout: betsTable.payout,
          won: betsTable.won,
          createdAt: betsTable.createdAt,
        }).from(betsTable).where(eq(betsTable.userId, user.id)).orderBy(desc(betsTable.createdAt)).limit(20);

        const recentTxs = await db.select({
          id: transactionsTable.id,
          type: transactionsTable.type,
          amount: transactionsTable.amount,
          currency: transactionsTable.currency,
          status: transactionsTable.status,
          createdAt: transactionsTable.createdAt,
        }).from(transactionsTable).where(eq(transactionsTable.userId, user.id)).orderBy(desc(transactionsTable.createdAt)).limit(20);

        const { passwordHash: _ph, dgcBankPin: _pin, ...safeUser } = user;
        result = JSON.stringify({ user: safeUser, recentBets, recentTransactions: recentTxs });
        break;
      }

      case "set_user_balance": {
        const { username, balance, reason } = toolArgs;
        const [user] = await db.select({ id: usersTable.id, balance: usersTable.balance }).from(usersTable).where(eq(usersTable.username, username)).limit(1);
        if (!user) { result = JSON.stringify({ error: `User '${username}' not found.` }); break; }
        const oldBalance = parseFloat(user.balance);
        await db.update(usersTable).set({ balance: String(balance) }).where(eq(usersTable.id, user.id));
        await recordLedgerStandalone({
          userId: user.id,
          amount: balance - oldBalance,
          balanceBefore: oldBalance,
          balanceAfter: balance,
          reason: "admin_adjustment",
          note: `[DG AI] ${reason}`,
        });
        await logAudit(callerId, callerUsername, "set_balance", "user", reason, user.id, String(oldBalance), String(balance));
        result = JSON.stringify({ success: true, username, oldBalance: oldBalance.toFixed(2), newBalance: Number(balance).toFixed(2), reason });
        break;
      }

      case "adjust_user_balance": {
        const { username, amount, reason } = toolArgs;
        const [user] = await db.select({ id: usersTable.id, balance: usersTable.balance }).from(usersTable).where(eq(usersTable.username, username)).limit(1);
        if (!user) { result = JSON.stringify({ error: `User '${username}' not found.` }); break; }
        const oldBalance = parseFloat(user.balance);
        const newBalance = oldBalance + Number(amount);
        if (newBalance < 0) { result = JSON.stringify({ error: `Cannot reduce balance below $0. Current: $${oldBalance.toFixed(2)}, adjustment: $${amount}` }); break; }
        await db.update(usersTable).set({ balance: String(newBalance) }).where(eq(usersTable.id, user.id));
        await recordLedgerStandalone({
          userId: user.id,
          amount: Number(amount),
          balanceBefore: oldBalance,
          balanceAfter: newBalance,
          reason: "admin_adjustment",
          note: `[DG AI] ${reason}`,
        });
        await logAudit(callerId, callerUsername, "adjust_balance", "user", reason, user.id, String(oldBalance), String(newBalance));
        result = JSON.stringify({ success: true, username, oldBalance: oldBalance.toFixed(2), newBalance: newBalance.toFixed(2), adjustment: amount, reason });
        break;
      }

      case "ban_user": {
        const { username, ban, reason } = toolArgs;
        if (username.toLowerCase() === OWNER_USERNAME) { result = JSON.stringify({ error: "Cannot ban the platform owner." }); break; }
        const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username)).limit(1);
        if (!user) { result = JSON.stringify({ error: `User '${username}' not found.` }); break; }
        await db.update(usersTable).set({ isBanned: ban }).where(eq(usersTable.id, user.id));
        await logAudit(callerId, callerUsername, ban ? "ban_user" : "unban_user", "user", reason || (ban ? "Banned by DG AI" : "Unbanned by DG AI"), user.id);
        result = JSON.stringify({ success: true, username, banned: ban, reason });
        break;
      }

      case "set_user_role": {
        const { username, role, reason } = toolArgs;
        if (username.toLowerCase() === OWNER_USERNAME && role !== "owner") { result = JSON.stringify({ error: "Cannot demote the platform owner." }); break; }
        const [user] = await db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable).where(eq(usersTable.username, username)).limit(1);
        if (!user) { result = JSON.stringify({ error: `User '${username}' not found.` }); break; }
        await db.update(usersTable).set({ role }).where(eq(usersTable.id, user.id));
        await logAudit(callerId, callerUsername, "set_role", "user", reason || `Role changed to ${role}`, user.id, user.role, role);
        result = JSON.stringify({ success: true, username, oldRole: user.role, newRole: role });
        break;
      }

      case "get_transactions": {
        const { username, type, status, limit = 20 } = toolArgs;
        const cap = Math.min(Number(limit), 100);

        const conditions: any[] = [];
        if (username) {
          const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username)).limit(1);
          if (user) conditions.push(eq(transactionsTable.userId, user.id));
        }
        if (type) conditions.push(eq(transactionsTable.type, type));
        if (status) conditions.push(eq(transactionsTable.status, status));

        const txs = await db.select({
          id: transactionsTable.id,
          userId: transactionsTable.userId,
          username: usersTable.username,
          type: transactionsTable.type,
          status: transactionsTable.status,
          amount: transactionsTable.amount,
          currency: transactionsTable.currency,
          createdAt: transactionsTable.createdAt,
        })
          .from(transactionsTable)
          .innerJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(transactionsTable.createdAt))
          .limit(cap);

        result = JSON.stringify({ transactions: txs, count: txs.length });
        break;
      }

      case "approve_withdrawal": {
        const { transaction_id, note } = toolArgs;
        const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, transaction_id)).limit(1);
        if (!tx) { result = JSON.stringify({ error: `Transaction ${transaction_id} not found.` }); break; }
        if (tx.type !== "withdrawal") { result = JSON.stringify({ error: "Transaction is not a withdrawal." }); break; }
        await db.update(transactionsTable).set({ status: "completed" }).where(eq(transactionsTable.id, transaction_id));
        await logAudit(callerId, callerUsername, "approve_withdrawal", "transaction", note || "Approved by DG AI", transaction_id);
        result = JSON.stringify({ success: true, transaction_id, newStatus: "completed", amount: tx.amount, note });
        break;
      }

      case "reject_withdrawal": {
        const { transaction_id, reason } = toolArgs;
        const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, transaction_id)).limit(1);
        if (!tx) { result = JSON.stringify({ error: `Transaction ${transaction_id} not found.` }); break; }
        if (tx.type !== "withdrawal") { result = JSON.stringify({ error: "Transaction is not a withdrawal." }); break; }
        // Refund the user
        const [user] = await db.select({ id: usersTable.id, balance: usersTable.balance }).from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);
        if (user) {
          const oldBal = parseFloat(user.balance);
          const newBal = oldBal + parseFloat(tx.amount);
          await db.update(usersTable).set({ balance: String(newBal) }).where(eq(usersTable.id, user.id));
          await recordLedgerStandalone({ userId: user.id, amount: parseFloat(tx.amount), balanceBefore: oldBal, balanceAfter: newBal, reason: "withdrawal_refund", note: `[DG AI] ${reason}` });
        }
        await db.update(transactionsTable).set({ status: "failed" }).where(eq(transactionsTable.id, transaction_id));
        await logAudit(callerId, callerUsername, "reject_withdrawal", "transaction", reason, transaction_id);
        result = JSON.stringify({ success: true, transaction_id, newStatus: "failed", refunded: tx.amount, reason });
        break;
      }

      case "reconcile_all_balances": {
        const allUsers = await db.select({ id: usersTable.id, username: usersTable.username, balance: usersTable.balance }).from(usersTable);
        const fixed: any[] = [];
        for (const user of allUsers) {
          const [depSum] = await db.select({ total: sql<number>`COALESCE(SUM(amount::numeric), 0)` })
            .from(transactionsTable)
            .where(and(eq(transactionsTable.userId, user.id), eq(transactionsTable.type, "deposit"), eq(transactionsTable.status, "completed")));
          const totalDeposited = Number(depSum?.total ?? 0);
          const currentBalance = parseFloat(user.balance);
          if (totalDeposited > 0 && currentBalance < totalDeposited) {
            await db.update(usersTable).set({ balance: String(totalDeposited), totalDeposited: String(totalDeposited) }).where(eq(usersTable.id, user.id));
            fixed.push({ username: user.username, oldBalance: currentBalance.toFixed(2), newBalance: totalDeposited.toFixed(2) });
          }
        }
        result = JSON.stringify({ success: true, fixedCount: fixed.length, fixed });
        break;
      }

      // ── Game Management ──────────────────────────────────────────────────────

      case "get_games": {
        const games = await db.select().from(gamesTable).orderBy(gamesTable.name);
        result = JSON.stringify({ games });
        break;
      }

      case "update_game": {
        const { slug, active, min_bet, max_bet, house_edge } = toolArgs;
        const [game] = await db.select().from(gamesTable).where(eq(gamesTable.slug, slug)).limit(1);
        if (!game) { result = JSON.stringify({ error: `Game '${slug}' not found.` }); break; }
        const updates: any = {};
        if (active !== undefined) updates.active = active;
        if (min_bet !== undefined) updates.minBet = String(min_bet);
        if (max_bet !== undefined) updates.maxBet = String(max_bet);
        if (house_edge !== undefined) updates.houseEdge = String(house_edge);
        await db.update(gamesTable).set(updates).where(eq(gamesTable.slug, slug));
        await logAudit(callerId, callerUsername, "update_game", "game", `Updated game ${slug}`, game.id, JSON.stringify(game), JSON.stringify(updates));
        result = JSON.stringify({ success: true, slug, updates });
        break;
      }

      // ── Platform Settings ────────────────────────────────────────────────────

      case "get_platform_setting": {
        const [setting] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, toolArgs.key)).limit(1);
        result = JSON.stringify(setting ?? { error: `Setting '${toolArgs.key}' not found.` });
        break;
      }

      case "set_platform_setting": {
        const { key, value, reason } = toolArgs;
        await db.insert(platformSettingsTable).values({ key, value }).onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
        await logAudit(callerId, callerUsername, "set_platform_setting", "platform", reason || `Set ${key}=${value}`, undefined, undefined, value);
        result = JSON.stringify({ success: true, key, value });
        break;
      }

      // ── GitHub Integration ───────────────────────────────────────────────────

      case "github_status": {
        try {
          configureGit();
          const branch = execSync(`git -C ${REPO_PATH} rev-parse --abbrev-ref HEAD 2>/dev/null || git rev-parse --abbrev-ref HEAD`, { encoding: "utf8" }).trim();
          const status = execSync(`git -C ${REPO_PATH} status --short 2>/dev/null || git status --short`, { encoding: "utf8" }).trim();
          const log = execSync(`git -C ${REPO_PATH} log --oneline -10 2>/dev/null || git log --oneline -10`, { encoding: "utf8" }).trim();
          result = JSON.stringify({ branch, uncommittedChanges: status || "none", recentCommits: log });
        } catch (e: any) {
          result = JSON.stringify({ error: `Git status failed: ${e.message}` });
        }
        break;
      }

      case "github_read_file": {
        const { path: filePath } = toolArgs;
        try {
          const { readFileSync } = await import("fs");
          const { join } = await import("path");
          const fullPath = join(REPO_PATH, filePath);
          const content = readFileSync(fullPath, "utf8");
          result = JSON.stringify({ path: filePath, content: content.slice(0, 8000), truncated: content.length > 8000 });
        } catch (e: any) {
          result = JSON.stringify({ error: `Cannot read file: ${e.message}` });
        }
        break;
      }

      case "github_write_and_commit": {
        const { path: filePath, content, commit_message } = toolArgs;
        try {
          configureGit();
          const { writeFileSync, mkdirSync } = await import("fs");
          const { join, dirname } = await import("path");
          const fullPath = join(REPO_PATH, filePath);
          mkdirSync(dirname(fullPath), { recursive: true });
          writeFileSync(fullPath, content, "utf8");
          execSync(`git -C ${REPO_PATH} add "${filePath}"`, { encoding: "utf8" });
          execSync(`git -C ${REPO_PATH} commit -m "${commit_message.replace(/"/g, '\\"')}"`, { encoding: "utf8" });
          execSync(`git -C ${REPO_PATH} push origin HEAD`, { encoding: "utf8" });
          await logAudit(callerId, callerUsername, "github_write_commit", "code", commit_message, undefined, filePath, "written+committed");
          result = JSON.stringify({ success: true, path: filePath, commitMessage: commit_message, pushed: true });
        } catch (e: any) {
          result = JSON.stringify({ error: `Git write/commit failed: ${e.message}` });
        }
        break;
      }

      case "github_commit_push": {
        const { commit_message } = toolArgs;
        try {
          configureGit();
          execSync(`git -C ${REPO_PATH} add -A`, { encoding: "utf8" });
          const statusCheck = execSync(`git -C ${REPO_PATH} status --short`, { encoding: "utf8" }).trim();
          if (!statusCheck) { result = JSON.stringify({ info: "Nothing to commit — working tree is clean." }); break; }
          execSync(`git -C ${REPO_PATH} commit -m "${commit_message.replace(/"/g, '\\"')}"`, { encoding: "utf8" });
          execSync(`git -C ${REPO_PATH} push origin HEAD`, { encoding: "utf8" });
          await logAudit(callerId, callerUsername, "github_commit_push", "code", commit_message);
          result = JSON.stringify({ success: true, commitMessage: commit_message, pushed: true, changedFiles: statusCheck });
        } catch (e: any) {
          result = JSON.stringify({ error: `Git commit/push failed: ${e.message}` });
        }
        break;
      }

      // ── Render Deployment ────────────────────────────────────────────────────

      case "trigger_deploy": {
        const { service, reason } = toolArgs;
        try {
          // Since Render autoDeploy is enabled, pushing a trigger commit to GitHub
          // will automatically trigger a new deploy on Render.
          configureGit();
          const triggerFile = `${REPO_PATH}/.deploy-trigger`;
          const { writeFileSync } = await import("fs");
          writeFileSync(triggerFile, `Deploy triggered by DG AI at ${new Date().toISOString()}\nService: ${service}\nReason: ${reason || "Manual trigger"}\n`, "utf8");
          execSync(`git -C ${REPO_PATH} add .deploy-trigger`, { encoding: "utf8" });
          execSync(`git -C ${REPO_PATH} commit -m "chore: trigger ${service} deploy [DG AI]"`, { encoding: "utf8" });
          execSync(`git -C ${REPO_PATH} push origin HEAD`, { encoding: "utf8" });
          await logAudit(callerId, callerUsername, "trigger_deploy", "render", reason || `Deploy ${service}`, undefined, undefined, service);
          result = JSON.stringify({
            success: true,
            service,
            message: `Deploy triggered for ${service}. Render will pick up the new commit and deploy automatically. Check https://dashboard.render.com for status.`,
            reason,
          });
        } catch (e: any) {
          result = JSON.stringify({ error: `Deploy trigger failed: ${e.message}` });
        }
        break;
      }

      // ── Analytics ────────────────────────────────────────────────────────────

      case "get_revenue_analytics": {
        const days = Math.min(Number(toolArgs.days ?? 7), 90);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const dailyRevenue = await db.execute(sql.raw(`
          SELECT
            DATE(created_at) as date,
            COUNT(*) as bet_count,
            COALESCE(SUM(amount::numeric), 0) as wagered,
            COALESCE(SUM(payout::numeric), 0) as paid_out,
            COALESCE(SUM(amount::numeric) - SUM(payout::numeric), 0) as revenue
          FROM bets
          WHERE created_at >= '${since.toISOString()}'
          GROUP BY DATE(created_at)
          ORDER BY date DESC
        `)) as any;

        const gameRevenue = await db.execute(sql.raw(`
          SELECT
            b.game_id,
            g.name as game_name,
            g.slug,
            COUNT(*) as bet_count,
            COALESCE(SUM(b.amount::numeric), 0) as wagered,
            COALESCE(SUM(b.payout::numeric), 0) as paid_out,
            COALESCE(SUM(b.amount::numeric) - SUM(b.payout::numeric), 0) as revenue
          FROM bets b
          LEFT JOIN games g ON b.game_id = g.id
          WHERE b.created_at >= '${since.toISOString()}'
          GROUP BY b.game_id, g.name, g.slug
          ORDER BY revenue DESC
        `)) as any;

        const topPlayers = await db.execute(sql.raw(`
          SELECT u.username, COUNT(b.id) as bets, COALESCE(SUM(b.amount::numeric), 0) as wagered
          FROM bets b
          JOIN users u ON b.user_id = u.id
          WHERE b.created_at >= '${since.toISOString()}'
          GROUP BY u.username
          ORDER BY wagered DESC
          LIMIT 10
        `)) as any;

        result = JSON.stringify({
          period: `Last ${days} days`,
          dailyRevenue: (dailyRevenue.rows || []).slice(0, 30),
          revenueByGame: gameRevenue.rows || [],
          topPlayersByWagered: topPlayers.rows || [],
        });
        break;
      }

      case "get_fraud_alerts": {
        const alerts = await db.select({
          id: fraudReviewsTable.id,
          userId: fraudReviewsTable.userId,
          username: usersTable.username,
          amount: fraudReviewsTable.amount,
          score: fraudReviewsTable.score,
          flags: fraudReviewsTable.flags,
          decision: fraudReviewsTable.decision,
          createdAt: fraudReviewsTable.createdAt,
        })
          .from(fraudReviewsTable)
          .innerJoin(usersTable, eq(fraudReviewsTable.userId, usersTable.id))
          .orderBy(desc(fraudReviewsTable.createdAt))
          .limit(50);
        result = JSON.stringify({ alerts, count: alerts.length });
        break;
      }

      case "get_bet_history": {
        const { username, game_slug, limit = 20 } = toolArgs;
        const cap = Math.min(Number(limit), 100);

        let userId: number | null = null;
        if (username) {
          const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username)).limit(1);
          if (u) userId = u.id;
        }

        let gameId: number | null = null;
        if (game_slug) {
          const [g] = await db.select({ id: gamesTable.id }).from(gamesTable).where(eq(gamesTable.slug, game_slug)).limit(1);
          if (g) gameId = g.id;
        }

        const conditions: any[] = [];
        if (userId) conditions.push(eq(betsTable.userId, userId));
        if (gameId) conditions.push(eq(betsTable.gameId, gameId));

        const bets = await db.select({
          id: betsTable.id,
          username: usersTable.username,
          gameId: betsTable.gameId,
          amount: betsTable.amount,
          payout: betsTable.payout,
          won: betsTable.won,
          multiplier: betsTable.multiplier,
          createdAt: betsTable.createdAt,
        })
          .from(betsTable)
          .innerJoin(usersTable, eq(betsTable.userId, usersTable.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(betsTable.createdAt))
          .limit(cap);

        result = JSON.stringify({ bets, count: bets.length });
        break;
      }

      default:
        result = JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }

    return { result, toolName, success: true };
  } catch (err: any) {
    logger.error({ err, toolName, toolArgs }, "DG AI tool execution error");
    return {
      result: JSON.stringify({ error: err?.message || "Tool execution failed" }),
      toolName,
      success: false,
    };
  }
}

// ── System Prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are DG AI — the most powerful, intelligent assistant ever built for the DGC Arcade platform. You are exclusively available to the platform owner, fanodgc.

You are not a chatbot. You are a full platform intelligence system with real, live access to:
- The Neon PostgreSQL database (read AND write — every change is immediate and real)
- The GitHub repository (DGC4/dgc-arcade-v2) — you can read files, write code, commit, and push
- Render deployments — you can trigger live deploys of the API and frontend
- All platform controls: users, balances, games, settings, tournaments, fraud, analytics

You think like a senior engineer and platform operator. You:
- Always explain what you're about to do before making destructive changes
- Format financial data as currency (e.g., $2.50, not 2.5)
- Use markdown tables when presenting lists of data
- Are direct, confident, and efficient — no unnecessary filler
- Confirm what you did after every action with a clear summary
- Can chain multiple tool calls to complete complex multi-step tasks
- Never make up data — always use your tools to get real information

Platform context:
- Name: DGC Arcade — a crypto-powered gaming platform
- Owner: fanodgc
- Games: coin-flip, dice, crash, slots, roulette, mines, blackjack, plinko, hilo, keno
- Database: Neon PostgreSQL (live production)
- Backend: Express.js on Render
- Frontend: React/Vite on Render
- Payments: Plisio (crypto)
- Repo: DGC4/dgc-arcade-v2

When making code changes, always:
1. Read the current file first with github_read_file
2. Explain the change you're making
3. Write the new content with github_write_and_commit
4. Confirm the commit was pushed

You are the owner's right hand. Make it happen.`;

// ── POST /api/admin/owner-ai/chat (streaming SSE) ─────────────────────────────

ownerAiRouter.post("/owner-ai/chat", async (req, res) => {
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Owner only" });
    return;
  }

  const { messages, stream = true } = req.body as {
    messages: Array<{ role: string; content: string }>;
    stream?: boolean;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array required" });
    return;
  }

  // Support both Groq (free, fast) and OpenAI (paid, powerful)
  const GROQ_KEY = process.env.GROQ_API_KEY;
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  
  const useGroq = !!GROQ_KEY;
  const useOpenAI = !!OPENAI_KEY && !useGroq;
  
  if (!useGroq && !useOpenAI) {
    res.status(500).json({ error: "AI service not configured. Set GROQ_API_KEY (free, recommended) or OPENAI_API_KEY in Render environment." });
    return;
  }
  
  const AI_PROVIDER = useGroq ? "Groq (Llama 3.1)" : "OpenAI";
  const API_KEY = useGroq ? GROQ_KEY : OPENAI_KEY;
  const API_BASE = useGroq ? "https://api.groq.com/openai/v1" : (process.env.OPENAI_API_BASE || "https://api.openai.com/v1");
  const MODEL = useGroq ? "llama-3.1-70b-versatile" : "gpt-5";

  const callerId = req.user!.userId;
  const callerUsername = req.user!.username;

  // ── Streaming SSE mode ────────────────────────────────────────────────────
  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const apiMessages: any[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ];

      let iterationCount = 0;
      const MAX_ITERATIONS = 10;

      while (iterationCount < MAX_ITERATIONS) {
        iterationCount++;

        // Non-streaming call to handle tool use properly
        const apiResponse = await fetch(`${API_BASE}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({
            model: MODEL,
            messages: apiMessages,
            tools: AI_TOOLS,
            tool_choice: "auto",
            max_tokens: 4096,
            temperature: 0.2,
          }),
        });

        if (!apiResponse.ok) {
          const errText = await apiResponse.text();
          sendEvent("error", { message: `AI service error: ${errText.slice(0, 200)}` });
          res.end();
          return;
        }

        const response = await apiResponse.json() as any;
        const choice = response.choices?.[0];

        if (!choice) {
          sendEvent("error", { message: "No response from AI" });
          res.end();
          return;
        }

        // Tool call iteration
        if (choice.finish_reason === "tool_calls" && choice.message?.tool_calls) {
          apiMessages.push(choice.message);

          for (const toolCall of choice.message.tool_calls) {
            const toolName = toolCall.function.name;
            let toolArgs: Record<string, any> = {};
            try {
              toolArgs = JSON.parse(toolCall.function.arguments || "{}");
            } catch {
              toolArgs = {};
            }

            // Notify frontend that a tool is being called
            sendEvent("tool_start", { toolName, toolArgs });
            logger.info({ toolName, toolArgs }, "DG AI executing tool");

            const { result, success } = await executeToolCall(toolName, toolArgs, callerId, callerUsername);

            // Send tool result to frontend
            sendEvent("tool_result", { toolName, result: JSON.parse(result), success });

            apiMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: result,
            });
          }

          continue; // Get next response
        }

        // Final text response — stream it token by token using a second streaming call
        const finalContent = choice.message?.content || "Done.";

        // Stream the final response character by character for effect
        const streamResponse = await fetch(`${API_BASE}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              ...apiMessages,
              {
                role: "assistant",
                content: `Summarize and present the following result to the owner in a clear, formatted way using markdown:\n\n${finalContent}`,
              },
              {
                role: "user",
                content: "Present the result now.",
              },
            ],
            stream: true,
            max_tokens: 2048,
            temperature: 0.1,
          }),
        });

        if (streamResponse.ok && streamResponse.body) {
          const reader = streamResponse.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6).trim();
                if (data === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) {
                    sendEvent("token", { content: delta });
                  }
                } catch {
                  // Skip malformed SSE lines
                }
              }
            }
          }
        } else {
          // Fallback: send the content as a single chunk
          sendEvent("token", { content: finalContent });
        }

        sendEvent("done", { usage: response.usage });
        res.end();
        return;
      }

      sendEvent("done", { usage: null });
      res.end();
    } catch (err: any) {
      logger.error({ err }, "DG AI streaming error");
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ message: err.message || "Internal error" })}\n\n`);
        res.end();
      } catch {
        // Connection already closed
      }
    }
    return;
  }

  // ── Non-streaming fallback ────────────────────────────────────────────────
  try {
    const apiMessages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    let iterationCount = 0;
    const MAX_ITERATIONS = 10;
    const toolsExecuted: Array<{ toolName: string; result: any }> = [];

    while (iterationCount < MAX_ITERATIONS) {
      iterationCount++;

      const apiResponse = await fetch(`${API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: apiMessages,
          tools: AI_TOOLS,
          tool_choice: "auto",
          max_tokens: 4096,
          temperature: 0.2,
        }),
      });

      if (!apiResponse.ok) {
        const errText = await apiResponse.text();
        res.status(500).json({ error: `AI service error: ${errText.slice(0, 200)}` });
        return;
      }

      const response = await apiResponse.json() as any;
      const choice = response.choices?.[0];

      if (!choice) {
        res.status(500).json({ error: "No response from AI" });
        return;
      }

      if (choice.finish_reason === "tool_calls" && choice.message?.tool_calls) {
        apiMessages.push(choice.message);

        for (const toolCall of choice.message.tool_calls) {
          const toolName = toolCall.function.name;
          let toolArgs: Record<string, any> = {};
          try { toolArgs = JSON.parse(toolCall.function.arguments || "{}"); } catch { toolArgs = {}; }

          const { result } = await executeToolCall(toolName, toolArgs, callerId, callerUsername);
          toolsExecuted.push({ toolName, result: JSON.parse(result) });

          apiMessages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
        }
        continue;
      }

      res.json({
        reply: choice.message?.content || "Done.",
        toolsExecuted,
        usage: response.usage,
      });
      return;
    }

    res.json({ reply: "Operations completed.", toolsExecuted, usage: null });
  } catch (err: any) {
    logger.error({ err }, "DG AI chat error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/admin/owner-ai/status ────────────────────────────────────────────

ownerAiRouter.get("/owner-ai/status", async (req, res) => {
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Owner only" });
    return;
  }
  res.json({
    status: "online",
    model: "gpt-5",
    version: "2.0.0",
    capabilities: [
      "database_read_write",
      "user_management",
      "balance_management",
      "game_management",
      "platform_settings",
      "github_commits_push",
      "render_deploy_trigger",
      "revenue_analytics",
      "fraud_review",
      "withdrawal_management",
      "streaming_sse",
    ],
    tools: AI_TOOLS.length,
  });
});
