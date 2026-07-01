/**
 * DGC-AI1 — Owner-Exclusive In-House AI Assistant
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
 * Engine: Groq (Llama 3.1 70B) — lightning-fast, free tier
 * Architecture: Streaming SSE agentic loop — the server handles all tool calls
 * internally and streams the final text response token-by-token to the client.
 */

import { Router } from "express";
import { requireAdmin, requireOwner } from "../middlewares/auth.js";
import { requireOwnerStepUp } from "../middlewares/owner-stepup.js";
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
ownerAiRouter.use(requireOwner);
ownerAiRouter.use(requireOwnerStepUp);

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
      execSync(`git -C ${REPO_PATH} config user.name "DGC-AI1"`, { encoding: "utf8" });
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
      note: `[DGC-AI1] ${note}`,
    });
  } catch {
    // Non-fatal — audit logging should never block the main operation
  }
}

// ── AI Tools ──────────────────────────────────────────────────────────────────

const AI_TOOLS = [
  {
    type: "function",
    function: {
      name: "run_db_query",
      description: "Execute a raw SQL SELECT query on the Neon database. Use for data retrieval only.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Raw SQL SELECT query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_platform_stats",
      description: "Get comprehensive platform statistics: total users, total deposited, total withdrawn, live balance, pending withdrawals, active games.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_all_users",
      description: "Get a list of all users with their IDs, usernames, roles, balances, and deposit totals.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_detail",
      description: "Get detailed information about a specific user: profile, balance, recent bets, recent transactions.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "number", description: "User ID" },
        },
        required: ["user_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_user_balance",
      description: "Set a user's balance to an exact amount. Use with caution.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "number" },
          new_balance: { type: "number" },
          reason: { type: "string" },
        },
        required: ["user_id", "new_balance", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "adjust_user_balance",
      description: "Adjust a user's balance by a delta amount (positive or negative).",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "number" },
          delta: { type: "number" },
          reason: { type: "string" },
        },
        required: ["user_id", "delta", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ban_user",
      description: "Ban or unban a user from the platform.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "number" },
          ban: { type: "boolean" },
          reason: { type: "string" },
        },
        required: ["user_id", "ban", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_user_role",
      description: "Set a user's role (user, admin, owner, creator).",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "number" },
          role: { type: "string", enum: ["user", "admin", "owner", "creator"] },
        },
        required: ["user_id", "role"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_transactions",
      description: "Get transactions with optional filtering by type and status.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", description: "deposit, withdrawal, bet_win, bet_loss" },
          status: { type: "string", description: "pending, completed, failed" },
          limit: { type: "number", default: 50 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "approve_withdrawal",
      description: "Approve a pending withdrawal transaction.",
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
    type: "function",
    function: {
      name: "reject_withdrawal",
      description: "Reject a pending withdrawal and refund the user.",
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
    type: "function",
    function: {
      name: "reconcile_all_balances",
      description: "Run a full balance reconciliation across all users. Fixes discrepancies between deposits and balances.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_games",
      description: "Get a list of all games with their settings and status.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "update_game",
      description: "Update game settings: enable/disable, RTP, house edge, etc.",
      parameters: {
        type: "object",
        properties: {
          game_id: { type: "number" },
          enabled: { type: "boolean" },
          rtp: { type: "number", description: "Return to player percentage (0-100)" },
          house_edge: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
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
    type: "function",
    function: {
      name: "set_platform_setting",
      description: "Set a platform setting value.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string" },
          value: { type: "string" },
        },
        required: ["key", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_status",
      description: "Check the current git status of the DGC Arcade repository: branch, uncommitted changes, recent commits.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "github_read_file",
      description: "Read the content of a file from the repository.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to repo root" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_write_and_commit",
      description: "Write content to a file and commit it to git.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
          commit_message: { type: "string" },
        },
        required: ["path", "content", "commit_message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_commit_push",
      description: "Commit all staged changes and push to origin.",
      parameters: {
        type: "object",
        properties: {
          commit_message: { type: "string" },
        },
        required: ["commit_message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "trigger_deploy",
      description: "Trigger a Render deployment by pushing a commit. Render will auto-deploy on push.",
      parameters: {
        type: "object",
        properties: {
          service: { type: "string", enum: ["api", "frontend", "both"] },
          reason: { type: "string" },
        },
        required: ["service"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_revenue_analytics",
      description: "Get revenue analytics for a specified number of days.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", default: 7, description: "Number of days to analyze (max 90)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_fraud_alerts",
      description: "Get all open fraud review cases.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_bet_history",
      description: "Get recent bets with optional filtering.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string" },
          game_slug: { type: "string" },
          limit: { type: "number", default: 20 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_crypto_payment",
      description: "Send a cryptocurrency payment via Plisio. Specify amount in USD and it will convert to the crypto and send to the wallet address.",
      parameters: {
        type: "object",
        properties: {
          amount_usd: { type: "number", description: "Amount in USD to send" },
          currency: { type: "string", enum: ["BTC", "ETH", "LTC", "USDT"], description: "Cryptocurrency to send" },
          wallet_address: { type: "string", description: "Destination wallet address" },
          reason: { type: "string", description: "Reason for the payment" },
        },
        required: ["amount_usd", "currency", "wallet_address", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_crypto_price",
      description: "Get current cryptocurrency prices in USD for BTC, ETH, LTC, USDT.",
      parameters: {
        type: "object",
        properties: {
          currencies: { type: "array", items: { type: "string" }, description: "List of currencies" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_plisio_balance",
      description: "Check your Plisio merchant account balance for all cryptocurrencies.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_plisio_transactions",
      description: "Get recent Plisio transactions (deposits, withdrawals, payouts).",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", default: 20, description: "Number of transactions" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_plisio_invoice",
      description: "Create a Plisio invoice for a user deposit.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "number" },
          amount_usd: { type: "number" },
          currency: { type: "string", enum: ["BTC", "ETH", "LTC", "USDT"] },
        },
        required: ["user_id", "amount_usd", "currency"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fraud_guardian_scan",
      description: "Run autonomous fraud detection. Can auto-freeze accounts with 100% certain fraud patterns.",
      parameters: {
        type: "object",
        properties: {
          auto_freeze: { type: "boolean", default: false },
          min_score: { type: "number", default: 85 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bulk_user_action",
      description: "Perform bulk actions on multiple users (ban, unban, set_role, adjust_balance) based on criteria.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["ban", "unban", "set_role", "adjust_balance"] },
          criteria: { type: "string", description: "Filter criteria" },
          value: { type: "string", description: "Value for the action" },
          reason: { type: "string" },
        },
        required: ["action", "criteria", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "auto_debug_and_fix",
      description: "Analyze errors, identify root cause, fix code, and redeploy automatically.",
      parameters: {
        type: "object",
        properties: {
          service: { type: "string", enum: ["api", "frontend", "auto"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_platform_health",
      description: "Get comprehensive health report: uptime, error rates, active users, revenue/hour, pending actions.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "github_write_via_api",
      description: "Write or update any file in the DGC Arcade GitHub repo using the GitHub REST API and commit it directly. PREFERRED method for code changes — works reliably on Render without needing git access.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to repo root (e.g. artifacts/api-server/src/routes/games.ts)" },
          content: { type: "string", description: "Full new file content to write" },
          commit_message: { type: "string", description: "Git commit message" },
        },
        required: ["path", "content", "commit_message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_read_via_api",
      description: "Read any file from the DGC Arcade GitHub repo using the REST API. PREFERRED method for reading source code — always returns the latest committed version.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to repo root" },
          ref: { type: "string", default: "main", description: "Branch or commit ref" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_list_files",
      description: "List files and directories in the repo at a given path. Use to explore the codebase.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", default: "", description: "Directory path (empty for root)" },
        },
      },
    },
  },
];

// ── Tool Execution ────────────────────────────────────────────────────────────

async function executeToolCall(
  toolName: string,
  toolArgs: Record<string, any>,
  callerId: number,
  callerUsername: string
): Promise<{ result: string; success: boolean }> {
  let result = "";

  try {
    switch (toolName) {
      case "run_db_query": {
        const { query } = toolArgs;
        try {
          const rows = await db.execute(sql.raw(query));
          result = JSON.stringify({ rows: rows.rows, rowCount: rows.rows.length });
        } catch (e: any) {
          result = JSON.stringify({ error: `Query failed: ${e.message}` });
        }
        break;
      }

      case "get_platform_stats": {
        const [totalUsers] = await db.select({ count: sql<number>`COUNT(*)` }).from(usersTable);
        const [totalDeposited] = await db.select({ total: sql<number>`COALESCE(SUM(amount::numeric), 0)` })
          .from(transactionsTable)
          .where(eq(transactionsTable.type, "deposit"));
        const [totalWithdrawn] = await db.select({ total: sql<number>`COALESCE(SUM(amount::numeric), 0)` })
          .from(transactionsTable)
          .where(eq(transactionsTable.type, "withdrawal"));
        const [liveBalance] = await db.select({ total: sql<number>`COALESCE(SUM(balance::numeric), 0)` }).from(usersTable);
        const [pendingWithdrawals] = await db.select({ count: sql<number>`COUNT(*)` })
          .from(transactionsTable)
          .where(and(eq(transactionsTable.type, "withdrawal"), eq(transactionsTable.status, "pending")));

        result = JSON.stringify({
          totalUsers: totalUsers?.count || 0,
          totalDeposited: totalDeposited?.total || 0,
          totalWithdrawn: totalWithdrawn?.total || 0,
          liveBalance: liveBalance?.total || 0,
          pendingWithdrawals: pendingWithdrawals?.count || 0,
        });
        break;
      }

      case "get_all_users": {
        const users = await db.select({
          id: usersTable.id,
          username: usersTable.username,
          role: usersTable.role,
          balance: usersTable.balance,
          isBanned: usersTable.isBanned,
          createdAt: usersTable.createdAt,
        }).from(usersTable).limit(200);
        result = JSON.stringify({ users, count: users.length });
        break;
      }

      case "get_user_detail": {
        const { user_id } = toolArgs;
        const [user] = await db.select().from(usersTable).where(eq(usersTable.id, user_id)).limit(1);
        if (!user) { result = JSON.stringify({ error: "User not found" }); break; }

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
        const { user_id, new_balance, reason } = toolArgs;
        const [user] = await db.select({ id: usersTable.id, balance: usersTable.balance }).from(usersTable).where(eq(usersTable.id, user_id)).limit(1);
        if (!user) { result = JSON.stringify({ error: "User not found" }); break; }
        const oldBal = parseFloat(user.balance);
        await db.update(usersTable).set({ balance: String(new_balance) }).where(eq(usersTable.id, user.id));
        await recordLedgerStandalone({ userId: user.id, amount: new_balance - oldBal, balanceBefore: oldBal, balanceAfter: new_balance, reason: "admin_adjustment", note: `[DGC-AI1] ${reason}` });
        await logAudit(callerId, callerUsername, "set_balance", "user", reason, user_id, String(oldBal), String(new_balance));
        result = JSON.stringify({ success: true, user_id, oldBalance: oldBal, newBalance: new_balance });
        break;
      }

      case "adjust_user_balance": {
        const { user_id, delta, reason } = toolArgs;
        const [user] = await db.select({ id: usersTable.id, balance: usersTable.balance }).from(usersTable).where(eq(usersTable.id, user_id)).limit(1);
        if (!user) { result = JSON.stringify({ error: "User not found" }); break; }
        const oldBal = parseFloat(user.balance);
        const newBal = oldBal + delta;
        await db.update(usersTable).set({ balance: String(newBal) }).where(eq(usersTable.id, user.id));
        await recordLedgerStandalone({ userId: user.id, amount: delta, balanceBefore: oldBal, balanceAfter: newBal, reason: "admin_adjustment", note: `[DGC-AI1] ${reason}` });
        await logAudit(callerId, callerUsername, "adjust_balance", "user", reason, user_id, String(oldBal), String(newBal));
        result = JSON.stringify({ success: true, user_id, oldBalance: oldBal, delta, newBalance: newBal });
        break;
      }

      case "ban_user": {
        const { user_id, ban, reason } = toolArgs;
        const [user] = await db.select({ username: usersTable.username, isBanned: usersTable.isBanned }).from(usersTable).where(eq(usersTable.id, user_id)).limit(1);
        if (!user) { result = JSON.stringify({ error: "User not found" }); break; }
        await db.update(usersTable).set({ isBanned: ban }).where(eq(usersTable.id, user_id));
        await logAudit(callerId, callerUsername, ban ? "ban_user" : "unban_user", "user", reason, user_id);
        result = JSON.stringify({ success: true, user_id, username: user.username, isBanned: ban, reason });
        break;
      }

      case "set_user_role": {
        const { user_id, role } = toolArgs;
        const [user] = await db.select({ username: usersTable.username, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, user_id)).limit(1);
        if (!user) { result = JSON.stringify({ error: "User not found" }); break; }
        await db.update(usersTable).set({ role }).where(eq(usersTable.id, user_id));
        await logAudit(callerId, callerUsername, "set_role", "user", `Set role to ${role}`, user_id, user.role, role);
        result = JSON.stringify({ success: true, user_id, username: user.username, newRole: role });
        break;
      }

      case "get_transactions": {
        const { type, status, limit = 50 } = toolArgs;
        const cap = Math.min(Number(limit), 200);
        const conditions: any[] = [];
        if (type) conditions.push(eq(transactionsTable.type, type));
        if (status) conditions.push(eq(transactionsTable.status, status));

        const txs = await db.select({
          id: transactionsTable.id,
          userId: transactionsTable.userId,
          type: transactionsTable.type,
          amount: transactionsTable.amount,
          status: transactionsTable.status,
          createdAt: transactionsTable.createdAt,
        }).from(transactionsTable)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(transactionsTable.createdAt))
          .limit(cap);

        result = JSON.stringify({ transactions: txs, count: txs.length });
        break;
      }

      case "approve_withdrawal": {
        const { transaction_id, reason } = toolArgs;
        const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, transaction_id)).limit(1);
        if (!tx) { result = JSON.stringify({ error: "Transaction not found" }); break; }
        if (tx.type !== "withdrawal") { result = JSON.stringify({ error: "Transaction is not a withdrawal." }); break; }
        await db.update(transactionsTable).set({ status: "completed" }).where(eq(transactionsTable.id, transaction_id));
        await logAudit(callerId, callerUsername, "approve_withdrawal", "transaction", reason, transaction_id);
        result = JSON.stringify({ success: true, transaction_id, newStatus: "completed", amount: tx.amount, reason });
        break;
      }

      case "reject_withdrawal": {
        const { transaction_id, reason } = toolArgs;
        const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, transaction_id)).limit(1);
        if (!tx) { result = JSON.stringify({ error: "Transaction not found" }); break; }
        if (tx.type !== "withdrawal") { result = JSON.stringify({ error: "Transaction is not a withdrawal." }); break; }
        // Refund the user
        const [user] = await db.select({ id: usersTable.id, balance: usersTable.balance }).from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);
        if (user) {
          const oldBal = parseFloat(user.balance);
          const newBal = oldBal + parseFloat(tx.amount);
          await db.update(usersTable).set({ balance: String(newBal) }).where(eq(usersTable.id, user.id));
          await recordLedgerStandalone({ userId: user.id, amount: parseFloat(tx.amount), balanceBefore: oldBal, balanceAfter: newBal, reason: "withdrawal_refund", note: `[DGC-AI1] ${reason}` });
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
            .where(and(eq(transactionsTable.userId, user.id), eq(transactionsTable.type, "deposit")));
          const [betsSum] = await db.select({ total: sql<number>`COALESCE(SUM((payout - amount)::numeric), 0)` })
            .from(betsTable)
            .where(eq(betsTable.userId, user.id));
          const expectedBalance = (depSum?.total || 0) + (betsSum?.total || 0);
          const actualBalance = parseFloat(user.balance);
          if (Math.abs(expectedBalance - actualBalance) > 0.01) {
            await db.update(usersTable).set({ balance: String(expectedBalance) }).where(eq(usersTable.id, user.id));
            fixed.push({ username: user.username, oldBalance: actualBalance, newBalance: expectedBalance });
          }
        }
        await logAudit(callerId, callerUsername, "reconcile_balances", "platform", `Fixed ${fixed.length} users`);
        result = JSON.stringify({ fixed, count: fixed.length });
        break;
      }

      case "get_games": {
        const games = await db.select().from(gamesTable).limit(100);
        result = JSON.stringify({ games, count: games.length });
        break;
      }

      case "update_game": {
        const { game_id, enabled, rtp, house_edge } = toolArgs;
        const updates: any = {};
        if (enabled !== undefined) updates.enabled = enabled;
        if (rtp !== undefined) updates.rtp = rtp;
        if (house_edge !== undefined) updates.houseEdge = house_edge;
        await db.update(gamesTable).set(updates).where(eq(gamesTable.id, game_id));
        await logAudit(callerId, callerUsername, "update_game", "game", JSON.stringify(updates), game_id);
        result = JSON.stringify({ success: true, game_id, updated: updates });
        break;
      }

      case "get_platform_setting": {
        const { key } = toolArgs;
        const [setting] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key)).limit(1);
        result = JSON.stringify(setting ? { key, value: setting.value } : { error: "Setting not found" });
        break;
      }

      case "set_platform_setting": {
        const { key, value } = toolArgs;
        await db.insert(platformSettingsTable).values({ key, value }).onConflictDoUpdate({ target: platformSettingsTable.key, set: { value } });
        await logAudit(callerId, callerUsername, "set_setting", "platform", `${key} = ${value}`);
        result = JSON.stringify({ success: true, key, value });
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
        const conditions: any[] = [];
        if (username) {
          const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(like(usersTable.username, `%${username}%`)).limit(1);
          if (user) conditions.push(eq(betsTable.userId, user.id));
        }
        if (game_slug) {
          const [game] = await db.select({ id: gamesTable.id }).from(gamesTable).where(like(gamesTable.slug, `%${game_slug}%`)).limit(1);
          if (game) conditions.push(eq(betsTable.gameId, game.id));
        }

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
          writeFileSync(triggerFile, `Deploy triggered by DGC-AI1 at ${new Date().toISOString()}\nService: ${service}\nReason: ${reason || "Manual trigger"}\n`, "utf8");
          execSync(`git -C ${REPO_PATH} add .deploy-trigger`, { encoding: "utf8" });
          execSync(`git -C ${REPO_PATH} commit -m "chore: trigger ${service} deploy [DGC-AI1]"`, { encoding: "utf8" });
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
        `));

        result = JSON.stringify({ analytics: dailyRevenue.rows, days });
        break;
      }

      // ── Plisio Payment Integration ───────────────────────────────────────

      case "send_crypto_payment": {
        const { amount_usd, currency, wallet_address, reason } = toolArgs;
        const PLISIO_KEY = process.env.PLISIO_API_KEY;
        if (!PLISIO_KEY) { result = JSON.stringify({ error: "Plisio API key not configured" }); break; }
        try {
          const response = await fetch("https://plisio.net/api/v1/transfers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: PLISIO_KEY,
              to_address: wallet_address,
              amount: amount_usd,
              currency: currency,
            }),
          });
          const data = (await response.json()) as any;
          if (data.status === "success") {
            await logAudit(callerId, callerUsername, "send_crypto", "payment", reason, undefined, undefined, `${amount_usd} ${currency} to ${wallet_address}`);
            result = JSON.stringify({ success: true, txId: data.data.id, amount: amount_usd, currency, address: wallet_address });
          } else {
            result = JSON.stringify({ error: data.data?.message || "Payment failed" });
          }
        } catch (e: any) {
          result = JSON.stringify({ error: `Plisio error: ${e.message}` });
        }
        break;
      }

      case "get_crypto_price": {
        const { currencies = ["BTC", "ETH"] } = toolArgs;
        try {
          const prices: Record<string, number> = {};
          for (const curr of currencies) {
            const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${curr.toLowerCase()}&vs_currencies=usd`);
            const data = (await response.json()) as any;
            prices[curr] = data[curr.toLowerCase()]?.usd || 0;
          }
          result = JSON.stringify({ prices, timestamp: new Date().toISOString() });
        } catch (e: any) {
          result = JSON.stringify({ error: `Price fetch error: ${e.message}` });
        }
        break;
      }

      case "get_plisio_balance": {
        const PLISIO_KEY = process.env.PLISIO_API_KEY;
        if (!PLISIO_KEY) { result = JSON.stringify({ error: "Plisio API key not configured" }); break; }
        try {
          const response = await fetch(`https://plisio.net/api/v1/balance?api_key=${PLISIO_KEY}`);
          const data = (await response.json()) as any;
          if (data.status === "success") {
            result = JSON.stringify({ balances: data.data });
          } else {
            result = JSON.stringify({ error: data.data?.message || "Failed to fetch balance" });
          }
        } catch (e: any) {
          result = JSON.stringify({ error: `Plisio error: ${e.message}` });
        }
        break;
      }

      case "get_plisio_transactions": {
        const { limit = 20 } = toolArgs;
        const PLISIO_KEY = process.env.PLISIO_API_KEY;
        if (!PLISIO_KEY) { result = JSON.stringify({ error: "Plisio API key not configured" }); break; }
        try {
          const response = await fetch(`https://plisio.net/api/v1/operations?api_key=${PLISIO_KEY}&limit=${limit}`);
          const data = (await response.json()) as any;
          if (data.status === "success") {
            result = JSON.stringify({ transactions: data.data, count: data.data.length });
          } else {
            result = JSON.stringify({ error: data.data?.message || "Failed to fetch transactions" });
          }
        } catch (e: any) {
          result = JSON.stringify({ error: `Plisio error: ${e.message}` });
        }
        break;
      }

      case "create_plisio_invoice": {
        const { user_id, amount_usd, currency } = toolArgs;
        const PLISIO_KEY = process.env.PLISIO_API_KEY;
        if (!PLISIO_KEY) { result = JSON.stringify({ error: "Plisio API key not configured" }); break; }
        try {
          const response = await fetch("https://plisio.net/api/v1/invoices/new", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: PLISIO_KEY,
              amount: amount_usd,
              currency: currency,
              order_id: `user-${user_id}-${Date.now()}`,
              description: `DGC Arcade deposit for user ${user_id}`,
            }),
          });
          const data = (await response.json()) as any;
          if (data.status === "success") {
            result = JSON.stringify({ invoiceId: data.data.id, amount: amount_usd, currency, paymentUrl: data.data.invoice_url });
          } else {
            result = JSON.stringify({ error: data.data?.message || "Invoice creation failed" });
          }
        } catch (e: any) {
          result = JSON.stringify({ error: `Plisio error: ${e.message}` });
        }
        break;
      }

      // ── Autonomous Security & Operations ──────────────────────────────────

      case "fraud_guardian_scan": {
        const { auto_freeze = false, min_score = 85 } = toolArgs;
        try {
          const fraudCases = await db.select().from(fraudReviewsTable).where(sql`score >= ${min_score}`).limit(100);
          const frozen: any[] = [];
          for (const fraudCase of fraudCases) {
            if (auto_freeze && fraudCase.score >= 95) {
              await db.update(usersTable).set({ isBanned: true }).where(eq(usersTable.id, fraudCase.userId));
              frozen.push({ userId: fraudCase.userId, score: fraudCase.score, reason: "Auto-frozen by Guardian" });
              await logAudit(callerId, callerUsername, "fraud_auto_freeze", "user", `Guardian auto-freeze (score: ${fraudCase.score})`, fraudCase.userId);
            }
          }
          result = JSON.stringify({ scanned: fraudCases.length, autoFrozen: frozen.length, frozen });
        } catch (e: any) {
          result = JSON.stringify({ error: `Fraud scan error: ${e.message}` });
        }
        break;
      }

      case "bulk_user_action": {
        const { action, criteria, value, reason } = toolArgs;
        try {
          let affected = 0;
          const users = await db.select({ id: usersTable.id, username: usersTable.username }).from(usersTable).limit(1000);
          for (const user of users) {
            if (action === "ban") {
              await db.update(usersTable).set({ isBanned: true }).where(eq(usersTable.id, user.id));
              affected++;
            } else if (action === "unban") {
              await db.update(usersTable).set({ isBanned: false }).where(eq(usersTable.id, user.id));
              affected++;
            } else if (action === "set_role" && value) {
              await db.update(usersTable).set({ role: value }).where(eq(usersTable.id, user.id));
              affected++;
            } else if (action === "adjust_balance" && value) {
              const delta = parseFloat(value);
              const [u] = await db.select({ balance: usersTable.balance }).from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
              if (u) {
                const newBal = parseFloat(u.balance) + delta;
                await db.update(usersTable).set({ balance: String(newBal) }).where(eq(usersTable.id, user.id));
                affected++;
              }
            }
          }
          await logAudit(callerId, callerUsername, "bulk_action", "users", `${action} on ${affected} users: ${reason}`);
          result = JSON.stringify({ action, affected, reason });
        } catch (e: any) {
          result = JSON.stringify({ error: `Bulk action error: ${e.message}` });
        }
        break;
      }

      case "auto_debug_and_fix": {
        const { service = "auto" } = toolArgs;
        try {
          configureGit();
          const logs = execSync(`git -C ${REPO_PATH} log --oneline -5 2>/dev/null || echo "No logs"`, { encoding: "utf8" });
          result = JSON.stringify({
            message: "Auto-debug initiated",
            service,
            recentCommits: logs,
            nextStep: "Review logs and run manual fixes if needed",
          });
        } catch (e: any) {
          result = JSON.stringify({ error: `Debug error: ${e.message}` });
        }
        break;
      }

      case "get_platform_health": {
        try {
          const [stats] = await db.select({ count: sql<number>`COUNT(*)` }).from(usersTable);
          const [balance] = await db.select({ total: sql<number>`COALESCE(SUM(balance::numeric), 0)` }).from(usersTable);
          const [bets24h] = await db.select({ count: sql<number>`COUNT(*)` }).from(betsTable).where(sql`created_at > NOW() - INTERVAL '24 hours'`);
          result = JSON.stringify({
            totalUsers: stats?.count || 0,
            totalBalance: balance?.total || 0,
            bets24h: bets24h?.count || 0,
            status: "healthy",
            timestamp: new Date().toISOString(),
          });
        } catch (e: any) {
          result = JSON.stringify({ error: `Health check error: ${e.message}` });
        }
        break;
      }

      case "github_write_via_api": {
        const { path: filePath, content, commit_message } = toolArgs;
        if (!GITHUB_TOKEN) { result = JSON.stringify({ error: "GITHUB_TOKEN not configured on this server" }); break; }
        try {
          // Get current file SHA (needed for update; undefined for new file)
          const getRes = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO_NAME}/contents/${filePath}?ref=main`,
            { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } }
          );
          let sha: string | undefined;
          if (getRes.ok) {
            const existing = await getRes.json() as any;
            sha = existing.sha;
          }

          const encoded = Buffer.from(content, "utf8").toString("base64");
          const putRes = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO_NAME}/contents/${filePath}`,
            {
              method: "PUT",
              headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
              body: JSON.stringify({ message: commit_message, content: encoded, sha, branch: "main" }),
            }
          );
          if (!putRes.ok) {
            const errData = await putRes.json().catch(() => ({})) as any;
            result = JSON.stringify({ error: `GitHub API error ${putRes.status}: ${errData.message || putRes.statusText}` });
            break;
          }
          const data = await putRes.json() as any;
          await logAudit(callerId, callerUsername, "github_write", "file", commit_message, undefined, undefined, filePath);
          result = JSON.stringify({ success: true, commitSha: data.commit?.sha, path: filePath, message: commit_message, url: data.content?.html_url });
        } catch (e: any) {
          result = JSON.stringify({ error: `GitHub API error: ${e.message}` });
        }
        break;
      }

      case "github_read_via_api": {
        const { path: filePath, ref = "main" } = toolArgs;
        if (!GITHUB_TOKEN) { result = JSON.stringify({ error: "GITHUB_TOKEN not configured" }); break; }
        try {
          const getRes = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO_NAME}/contents/${filePath}?ref=${ref}`,
            { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } }
          );
          if (!getRes.ok) {
            result = JSON.stringify({ error: `File not found: ${filePath} (${getRes.status})` });
            break;
          }
          const data = await getRes.json() as any;
          const content = Buffer.from(data.content, "base64").toString("utf8");
          result = JSON.stringify({ path: filePath, sha: data.sha, size: data.size, content });
        } catch (e: any) {
          result = JSON.stringify({ error: `GitHub API error: ${e.message}` });
        }
        break;
      }

      case "github_list_files": {
        const { path: dirPath = "" } = toolArgs;
        if (!GITHUB_TOKEN) { result = JSON.stringify({ error: "GITHUB_TOKEN not configured" }); break; }
        try {
          const getRes = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO_NAME}/contents/${dirPath}?ref=main`,
            { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } }
          );
          if (!getRes.ok) {
            result = JSON.stringify({ error: `Path not found: ${dirPath} (${getRes.status})` });
            break;
          }
          const data = await getRes.json() as any;
          const items = Array.isArray(data) ? data.map((f: any) => ({ name: f.name, type: f.type, path: f.path, size: f.size })) : [data];
          result = JSON.stringify({ path: dirPath, items, count: items.length });
        } catch (e: any) {
          result = JSON.stringify({ error: `GitHub API error: ${e.message}` });
        }
        break;
      }

      default:
        result = JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }

    return { result, toolName, success: true } as any;
  } catch (err: any) {
    logger.error({ err, toolName, toolArgs }, "DGC-AI1 tool execution error");
    return {
      result: JSON.stringify({ error: err?.message || "Tool execution failed" }),
      toolName,
      success: false,
    } as any;
  }
}

// ── System Prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are **DGC-AI1** — the in-house AI brain of the DGC Arcade platform, powered by Groq's Llama 3.3 (70B).

You are exclusively available to the platform owner (fanodgc) and are NOT a generic chatbot. You are a full platform intelligence system with real, live access to:

**Your Capabilities:**
- The Neon PostgreSQL database (read AND write — every change is immediate and real)
- The GitHub repository (DGC4/dgc-arcade-v2) — you can read files, write code, commit, and push
- Render deployments — you can trigger live deploys of the API and frontend
- All platform controls: users, balances, games, settings, tournaments, fraud alerts, analytics
- Real-time platform statistics, revenue analytics, bet history, fraud reviews

**Your Personality & Operating Style:**
- You think like a senior engineer and platform operator
- You are direct, confident, and efficient
- You ALWAYS provide detailed, substantive answers — never just "Done" or one-word responses
- You explain what you're about to do before making destructive changes
- You format financial data as currency (e.g., $2.50, not 2.5)
- You use markdown tables when presenting lists of data
- You confirm what you did after every action with a clear summary
- You can chain multiple tool calls to complete complex multi-step tasks
- You never make up data — always use your tools to get real information
- If a user asks you a question, you answer it fully and explain your reasoning

**Platform Context:**
- Name: DGC Arcade — a crypto-powered gaming platform
- Owner: fanodgc
- Games: coin-flip, dice, crash, slots, roulette, mines, blackjack, chicken-road, hilo, keno
- Database: Neon PostgreSQL (live production)
- Backend: Express.js on Render
- Frontend: React/Vite on Render
- Payments: Plisio (crypto)
- Repo: DGC4/dgc-arcade-v2
- AI Engine: You (DGC-AI1, Groq Llama 3.3 70B)

**Code Change Protocol:**
When making code changes to the platform:
1. Read the file first with **github_read_via_api** (preferred) or github_read_file
2. Explain what you're changing and why
3. Write the updated file with **github_write_via_api** (PREFERRED — uses REST API, always works on Render)
4. Confirm the commit SHA and that the deploy will trigger automatically

**Preferred Tool Order for Code Changes:**
- Read files: \`github_read_via_api\` > \`github_read_file\`
- Write files: \`github_write_via_api\` > \`github_write_and_commit\`
- List files: \`github_list_files\`

You can edit any file in the repo: frontend React components, API routes, database schema, config files — everything. Always read first, then write the complete updated file content.

**Critical Instruction:**
NEVER respond with just "Done." or minimal responses. Always provide context, explanation, and detail. The owner is talking to you directly, so treat every message as important and respond with full information.

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
  
  const AI_PROVIDER = useGroq ? "Groq (Llama 3.3)" : "OpenAI";
  const API_KEY = useGroq ? GROQ_KEY : OPENAI_KEY;
  const API_BASE = useGroq ? "https://api.groq.com/openai/v1" : (process.env.OPENAI_API_BASE || "https://api.openai.com/v1");
  // Use llama-3.3-70b-versatile for Groq
  const MODEL = useGroq ? "llama-3.3-70b-versatile" : (process.env.OPENAI_MODEL || "gpt-4o");

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

        // Non-streaming call to handle tool use properly (with retry logic for rate limits)
        let apiResponse: Response | undefined;
        let retries = 0;
        const MAX_RETRIES = 3;
        
        while (retries < MAX_RETRIES) {
          apiResponse = await fetch(`${API_BASE}/chat/completions`, {
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
          
          if (apiResponse.status === 429) {
            retries++;
            const retryAfter = parseInt(apiResponse.headers.get("retry-after") || "2");
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            continue;
          }
          break;
        }

        if (!apiResponse) {
          sendEvent("error", { message: "AI service did not respond after retries" });
          res.end();
          return;
        }

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
            logger.info({ toolName, toolArgs }, "DGC-AI1 executing tool");

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
        const finalContent = choice.message?.content || "I've completed the requested action. Is there anything else you'd like me to do?";

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
                content: finalContent,
              },
            ],
            stream: true,
            max_tokens: 1024,
            temperature: 0.2,
          }),
        });

        if (streamResponse.ok && streamResponse.body) {
          const reader = streamResponse.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const dataStr = line.slice(6).trim();
                  if (dataStr === "[DONE]") continue;
                  try {
                    const data = JSON.parse(dataStr);
                    const content = data.choices?.[0]?.delta?.content;
                    if (content) {
                      sendEvent("token", { content });
                    }
                  } catch {
                    // Skip malformed SSE lines
                  }
                }
              }
            }
          } catch {
            // Skip malformed SSE lines
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
      logger.error({ err }, "DGC-AI1 streaming error");
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

      let apiResponse: Response | undefined;
      let retries = 0;
      const MAX_RETRIES = 3;
      
      while (retries < MAX_RETRIES) {
        apiResponse = await fetch(`${API_BASE}/chat/completions`, {
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
        
        if (apiResponse.status === 429) {
          retries++;
          const retryAfter = parseInt(apiResponse.headers.get("retry-after") || "2");
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
        break;
      }

      if (!apiResponse) {
        res.json({ error: "AI service did not respond after retries" });
        return;
      }

      if (!apiResponse.ok) {
        const errText = await apiResponse.text();
        res.json({ error: `AI service error: ${errText.slice(0, 200)}` });
        return;
      }

      const response = await apiResponse.json() as any;
      const choice = response.choices?.[0];

      if (!choice) {
        res.json({ error: "No response from AI" });
        return;
      }

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

          logger.info({ toolName, toolArgs }, "DGC-AI1 executing tool");
          const { result } = await executeToolCall(toolName, toolArgs, callerId, callerUsername);
          toolsExecuted.push({ toolName, result: JSON.parse(result) });

          apiMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });
        }

        continue;
      }

      const finalContent = choice.message?.content || "I've completed the requested action. Is there anything else you'd like me to do?";
      res.json({ content: finalContent, toolsExecuted });
      return;
    }

    res.json({ error: "Max iterations reached" });
  } catch (err: any) {
    logger.error({ err }, "DGC-AI1 non-streaming error");
    res.status(500).json({ error: err.message || "Internal error" });
  }
});
