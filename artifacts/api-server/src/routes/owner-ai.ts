import { Router } from "express";
import { requireAdmin } from "../middlewares/auth.js";
import { db, usersTable, transactionsTable, betsTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { recordLedgerStandalone } from "../services/ledger.js";
import { logger } from "../lib/logger.js";

export const ownerAiRouter = Router();
ownerAiRouter.use(requireAdmin);

const OWNER_USERNAME = "fanodgc";

async function callerIsOwner(req: { user?: { userId: number } }): Promise<boolean> {
  if (!req.user) return false;
  const [caller] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, req.user.userId)).limit(1);
  return (caller?.username ?? "").toLowerCase() === OWNER_USERNAME;
}

// ── Tool definitions for the AI ──────────────────────────────────────────────

const AI_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "run_db_query",
      description: "Run a read-only SQL SELECT query on the DGC Arcade database. Use this to look up users, balances, transactions, bets, etc.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "A SELECT SQL query to execute. Must be read-only." }
        },
        required: ["sql"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "set_user_balance",
      description: "Set a user's static USD balance to a specific amount. This is an admin override. Use carefully.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "The username of the user to update." },
          balance: { type: "number", description: "The new balance amount in USD." },
          reason: { type: "string", description: "The reason for the balance change (for the audit ledger)." }
        },
        required: ["username", "balance", "reason"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "adjust_user_balance",
      description: "Add or subtract an amount from a user's static USD balance. Use positive numbers to add, negative to subtract.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "The username of the user to update." },
          amount: { type: "number", description: "The amount to add (positive) or subtract (negative) in USD." },
          reason: { type: "string", description: "The reason for the adjustment (for the audit ledger)." }
        },
        required: ["username", "amount", "reason"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "get_all_users",
      description: "Get a list of all users with their current balances, roles, and deposit totals.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "get_transactions",
      description: "Get recent transactions, optionally filtered by username or status.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "Optional: filter by username." },
          status: { type: "string", description: "Optional: filter by status (pending, completed, failed)." },
          limit: { type: "number", description: "Number of transactions to return (default 20)." }
        }
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "reconcile_all_balances",
      description: "Trigger a full balance reconciliation for all users — checks completed deposits against user_balances and fixes any discrepancies.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "ban_user",
      description: "Ban or unban a user by username.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "The username to ban or unban." },
          ban: { type: "boolean", description: "true to ban, false to unban." }
        },
        required: ["username", "ban"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "get_platform_stats",
      description: "Get overall platform statistics: total users, total bets, total wagered, revenue, etc.",
      parameters: { type: "object", properties: {} }
    }
  }
];

// ── Tool execution functions ──────────────────────────────────────────────────

async function executeToolCall(toolName: string, toolArgs: Record<string, any>, callerId: number): Promise<string> {
  try {
    switch (toolName) {
      case "run_db_query": {
        const query = toolArgs.sql as string;
        // Safety: only allow SELECT queries
        const trimmed = query.trim().toUpperCase();
        if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("WITH")) {
          return JSON.stringify({ error: "Only SELECT queries are allowed for safety." });
        }
        const result = await db.execute(sql.raw(query)) as any;
        const rows = result.rows || result || [];
        return JSON.stringify({ rows: Array.isArray(rows) ? rows : [], rowCount: Array.isArray(rows) ? rows.length : 0 });
      }

      case "set_user_balance": {
        const { username, balance, reason } = toolArgs;
        const [user] = await db.select({ id: usersTable.id, balance: usersTable.balance }).from(usersTable).where(eq(usersTable.username, username)).limit(1);
        if (!user) return JSON.stringify({ error: `User '${username}' not found.` });
        const oldBalance = parseFloat(user.balance);
        await db.update(usersTable).set({ balance: String(balance) }).where(eq(usersTable.id, user.id));
        await recordLedgerStandalone({
          userId: user.id,
          amount: balance - oldBalance,
          balanceBefore: oldBalance,
          balanceAfter: balance,
          reason: "admin_adjustment",
          note: `[Owner AI] ${reason}`
        });
        return JSON.stringify({ success: true, username, oldBalance, newBalance: balance, reason });
      }

      case "adjust_user_balance": {
        const { username, amount, reason } = toolArgs;
        const [user] = await db.select({ id: usersTable.id, balance: usersTable.balance }).from(usersTable).where(eq(usersTable.username, username)).limit(1);
        if (!user) return JSON.stringify({ error: `User '${username}' not found.` });
        const oldBalance = parseFloat(user.balance);
        const newBalance = oldBalance + amount;
        if (newBalance < 0) return JSON.stringify({ error: `Cannot reduce balance below 0. Current: $${oldBalance}, adjustment: $${amount}` });
        await db.update(usersTable).set({ balance: String(newBalance) }).where(eq(usersTable.id, user.id));
        await recordLedgerStandalone({
          userId: user.id,
          amount,
          balanceBefore: oldBalance,
          balanceAfter: newBalance,
          reason: "admin_adjustment",
          note: `[Owner AI] ${reason}`
        });
        return JSON.stringify({ success: true, username, oldBalance, newBalance, adjustment: amount, reason });
      }

      case "get_all_users": {
        const users = await db.select({
          id: usersTable.id,
          username: usersTable.username,
          role: usersTable.role,
          balance: usersTable.balance,
          totalDeposited: usersTable.totalDeposited,
          isBanned: usersTable.isBanned,
          createdAt: usersTable.createdAt
        }).from(usersTable).orderBy(usersTable.id);
        return JSON.stringify({ users, count: users.length });
      }

      case "get_transactions": {
        const { username, status, limit = 20 } = toolArgs;
        const baseQuery = db.select({
          id: transactionsTable.id,
          userId: transactionsTable.userId,
          username: usersTable.username,
          type: transactionsTable.type,
          status: transactionsTable.status,
          amount: transactionsTable.amount,
          currency: transactionsTable.currency,
          createdAt: transactionsTable.createdAt
        }).from(transactionsTable)
          .innerJoin(usersTable, eq(transactionsTable.userId, usersTable.id));

        let targetUserId: number | null = null;
        if (username) {
          const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username)).limit(1);
          if (user) targetUserId = user.id;
        }

        let txs: any[];
        if (targetUserId && status) {
          txs = await baseQuery.where(eq(transactionsTable.userId, targetUserId)).where(eq(transactionsTable.status, status)).orderBy(desc(transactionsTable.createdAt)).limit(Math.min(limit, 100));
        } else if (targetUserId) {
          txs = await baseQuery.where(eq(transactionsTable.userId, targetUserId)).orderBy(desc(transactionsTable.createdAt)).limit(Math.min(limit, 100));
        } else if (status) {
          txs = await baseQuery.where(eq(transactionsTable.status, status)).orderBy(desc(transactionsTable.createdAt)).limit(Math.min(limit, 100));
        } else {
          txs = await baseQuery.orderBy(desc(transactionsTable.createdAt)).limit(Math.min(limit, 100));
        }

        return JSON.stringify({ transactions: txs, count: txs.length });
      }

      case "reconcile_all_balances": {
        // Get all users and check their completed deposits vs static balance
        const allUsers = await db.select({ id: usersTable.id, username: usersTable.username, balance: usersTable.balance }).from(usersTable);
        const fixed = [];
        for (const user of allUsers) {
          const completedDeposits = await db.select({ amount: transactionsTable.amount })
            .from(transactionsTable)
            .where(sql`${transactionsTable.userId} = ${user.id} AND ${transactionsTable.type} = 'deposit' AND ${transactionsTable.status} = 'completed'`);
          const totalDeposited = completedDeposits.reduce((sum: number, d: { amount: string }) => sum + parseFloat(d.amount), 0);
          const currentBalance = parseFloat(user.balance);
          if (totalDeposited > 0 && currentBalance < totalDeposited) {
            await db.update(usersTable).set({ 
              balance: String(totalDeposited),
              totalDeposited: String(totalDeposited)
            }).where(eq(usersTable.id, user.id));
            fixed.push({ username: user.username, oldBalance: currentBalance, newBalance: totalDeposited });
          }
        }
        return JSON.stringify({ success: true, fixedCount: fixed.length, fixed });
      }

      case "ban_user": {
        const { username, ban } = toolArgs;
        const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username)).limit(1);
        if (!user) return JSON.stringify({ error: `User '${username}' not found.` });
        await db.update(usersTable).set({ isBanned: ban }).where(eq(usersTable.id, user.id));
        return JSON.stringify({ success: true, username, banned: ban });
      }

      case "get_platform_stats": {
        const userCountResult = await db.select({ count: sql<number>`COUNT(*)` }).from(usersTable);
        const betStatsResult = await db.select({ 
          totalBets: sql<number>`COUNT(*)`,
          totalWagered: sql<number>`COALESCE(SUM(${betsTable.amount}), 0)`
        }).from(betsTable);
        const depositStatsResult = await db.select({
          totalDeposited: sql<number>`COALESCE(SUM(${transactionsTable.amount}), 0)`
        }).from(transactionsTable)
          .where(eq(transactionsTable.type, "deposit"))
          .where(eq(transactionsTable.status, "completed"));
        return JSON.stringify({
          totalUsers: userCountResult[0]?.count || 0,
          totalBets: betStatsResult[0]?.totalBets || 0,
          totalWagered: betStatsResult[0]?.totalWagered || 0,
          totalDeposited: depositStatsResult[0]?.totalDeposited || 0
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err: any) {
    logger.error({ err, toolName, toolArgs }, "Owner AI tool execution error");
    return JSON.stringify({ error: err?.message || "Tool execution failed" });
  }
}

// ── POST /api/admin/owner-ai/chat ─────────────────────────────────────────────

ownerAiRouter.post("/owner-ai/chat", async (req, res) => {
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Owner only" });
    return;
  }

  const { messages } = req.body as { messages: Array<{ role: string; content: string }> };
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array required" });
    return;
  }

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  const OPENAI_BASE = process.env.OPENAI_API_BASE || "https://api.openai.com/v1";

  if (!OPENAI_KEY) {
    res.status(500).json({ error: "OpenAI API key not configured" });
    return;
  }

  const systemPrompt = `You are the DGC Arcade Owner AI Assistant — a powerful, intelligent assistant built exclusively for the platform owner (fanodgc). 

You have full access to the DGC Arcade platform through specialized tools. You can:
- Query the database to look up users, balances, transactions, bets, and platform stats
- Adjust user balances (set or add/subtract amounts)
- Reconcile all account balances against completed deposits
- Ban or unban users
- Get platform statistics

You are connected to the live Neon PostgreSQL database. All changes you make are REAL and IMMEDIATE.

Current platform: DGC Arcade — a crypto-powered gaming platform
Database: Neon PostgreSQL (live)

Be concise, professional, and always confirm what you did after executing actions. When making changes, always explain what you changed and why. Format numbers as currency when appropriate (e.g., $2.00, not 2).

If asked to make code changes or push to GitHub, explain that GitHub code changes require the owner to use the Manus AI assistant for now, but all database operations can be done directly here.`;

  try {
    const apiMessages: any[] = [
      { role: "system", content: systemPrompt },
      ...messages
    ];

    let response: any;
    let iterationCount = 0;
    const MAX_ITERATIONS = 5;

    // Agentic loop: keep calling tools until the AI gives a final text response
    while (iterationCount < MAX_ITERATIONS) {
      iterationCount++;

      const apiResponse = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-5-mini",
          messages: apiMessages,
          tools: AI_TOOLS,
          tool_choice: "auto",
          max_tokens: 2048,
          temperature: 0.3
        })
      });

      if (!apiResponse.ok) {
        const errText = await apiResponse.text();
        logger.error({ status: apiResponse.status, body: errText }, "OpenAI API error");
        res.status(500).json({ error: "AI service error. Please try again." });
        return;
      }

      response = await apiResponse.json() as any;
      const choice = response.choices?.[0];

      if (!choice) {
        res.status(500).json({ error: "No response from AI" });
        return;
      }

      // If the AI wants to call tools
      if (choice.finish_reason === "tool_calls" && choice.message?.tool_calls) {
        apiMessages.push(choice.message);

        // Execute all tool calls
        for (const toolCall of choice.message.tool_calls) {
          const toolName = toolCall.function.name;
          let toolArgs: Record<string, any> = {};
          try {
            toolArgs = JSON.parse(toolCall.function.arguments || "{}");
          } catch {
            toolArgs = {};
          }

          logger.info({ toolName, toolArgs }, "Owner AI executing tool");
          const toolResult = await executeToolCall(toolName, toolArgs, req.user!.userId);

          apiMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult
          });
        }

        // Continue the loop to get the AI's next response
        continue;
      }

      // Final text response
      const content = choice.message?.content || "I completed the requested action.";
      res.json({ 
        reply: content,
        usage: response.usage
      });
      return;
    }

    // If we hit max iterations, return what we have
    res.json({ reply: "I've completed the operations. Please check the results above." });

  } catch (err: any) {
    logger.error({ err }, "Owner AI chat error");
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
    model: "gpt-5-mini",
    capabilities: ["database_queries", "balance_management", "user_management", "platform_stats"],
    version: "1.0.0"
  });
});
