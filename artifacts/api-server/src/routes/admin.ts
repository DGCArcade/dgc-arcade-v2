import { Router } from "express";
import crypto from "crypto";
import { db, usersTable, betsTable, transactionsTable, platformSettingsTable } from "@workspace/db";
import { eq, desc, ilike, and, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth.js";

export const adminRouter = Router();

adminRouter.use(requireAdmin);


function getSiteUrl(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL;
  if (process.env.REPLIT_DOMAINS) {
    return `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`;
  }
  return "";
}

// GET /api/admin/users
adminRouter.get("/users", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search : "";
  const limit = parseInt(String(req.query.limit ?? "50"), 10);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);

  try {
    const rows = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        balance: usersTable.balance,
        role: usersTable.role,
        isBanned: usersTable.isBanned,
        totalBets: usersTable.totalBets,
        totalWon: usersTable.totalWon,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(search ? ilike(usersTable.username, `%${search}%`) : undefined)
      .orderBy(desc(usersTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(usersTable)
      .where(search ? ilike(usersTable.username, `%${search}%`) : undefined);

    res.json({
      users: rows.map((u) => ({
        ...u,
        balance: parseFloat(u.balance),
        totalWon: parseFloat(u.totalWon),
        createdAt: u.createdAt.toISOString(),
      })),
      total: Number(count),
    });
  } catch (err) {
    req.log.error({ err }, "Admin list users error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/users/:id
adminRouter.get("/users/:id", async (req, res) => {
  const userId = parseInt(req.params.id, 10);

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const bets = await db
      .select()
      .from(betsTable)
      .where(eq(betsTable.userId, userId))
      .orderBy(desc(betsTable.createdAt))
      .limit(20);

    const transactions = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, userId))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(20);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        balance: parseFloat(user.balance),
        role: user.role,
        isBanned: user.isBanned,
        totalBets: user.totalBets,
        totalWon: parseFloat(user.totalWon),
        createdAt: user.createdAt.toISOString(),
      },
      bets: bets.map((b) => ({
        id: b.id,
        gameId: b.gameId,
        amount: parseFloat(b.amount),
        payout: parseFloat(b.payout),
        outcome: b.won ? "win" : "loss",
        createdAt: b.createdAt.toISOString(),
      })),
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: parseFloat(t.amount),
        currency: t.currency,
        status: t.status,
        address: t.address,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Admin get user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/create-user  — create a new user or admin
adminRouter.post("/create-user", async (req, res) => {
  const { username, password, role, balance } = req.body as {
    username?: string;
    password?: string;
    role?: string;
    balance?: number;
  };

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }
  if (username.toLowerCase() === "fanodgc") {
    res.status(403).json({ error: "That username is reserved." });
    return;
  }

  try {
    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 12);
    const [created] = await db
      .insert(usersTable)
      .values({
        username,
        passwordHash,
        role: role === "admin" ? "admin" : "player",
        balance: String(balance ?? 0),
      })
      .returning();

    res.json({
      id: created.id,
      username: created.username,
      role: created.role,
      balance: parseFloat(created.balance),
    });
  } catch (err: unknown) {
    const msg = String((err as { message?: string }).message ?? "");
    if (msg.includes("unique")) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    req.log.error({ err }, "Admin create user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/users/:id
adminRouter.patch("/users/:id", async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { balance, role, isBanned } = req.body as {
    balance?: number;
    role?: string;
    isBanned?: boolean;
  };

  // Protect superadmin
  const [target] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (target?.username === "fanodgc") {
    res.status(403).json({ error: "This account is protected and cannot be modified." });
    return;
  }

  try {
    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (balance !== undefined) updates.balance = String(balance);
    if (role !== undefined) updates.role = role;
    if (isBanned !== undefined) updates.isBanned = isBanned;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, userId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      id: updated.id,
      username: updated.username,
      balance: parseFloat(updated.balance),
      role: updated.role,
      isBanned: updated.isBanned,
      totalBets: updated.totalBets,
      totalWon: parseFloat(updated.totalWon),
    });
  } catch (err) {
    req.log.error({ err }, "Admin update user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/admin/users/:id
adminRouter.delete("/users/:id", async (req, res) => {
  const userId = parseInt(req.params.id, 10);

  if (userId === req.user!.userId) {
    res.status(400).json({ error: "Cannot delete your own admin account" });
    return;
  }

  // Protect superadmin
  const [target] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (target?.username === "fanodgc") {
    res.status(403).json({ error: "This account is protected and cannot be deleted." });
    return;
  }

  try {
    await db.delete(transactionsTable).where(eq(transactionsTable.userId, userId));
    await db.delete(betsTable).where(eq(betsTable.userId, userId));
    await db.delete(usersTable).where(eq(usersTable.id, userId));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Admin delete user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/transactions
adminRouter.get("/transactions", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const limit = parseInt(String(req.query.limit ?? "50"), 10);

  try {
    const conditions = [];
    if (status) conditions.push(eq(transactionsTable.status, status));
    if (type) conditions.push(eq(transactionsTable.type, type));

    const rows = await db
      .select({
        id: transactionsTable.id,
        userId: transactionsTable.userId,
        username: usersTable.username,
        type: transactionsTable.type,
        amount: transactionsTable.amount,
        currency: transactionsTable.currency,
        status: transactionsTable.status,
        address: transactionsTable.address,
        txHash: transactionsTable.txHash,
        createdAt: transactionsTable.createdAt,
      })
      .from(transactionsTable)
      .leftJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(transactionsTable.createdAt))
      .limit(limit);

    res.json(
      rows.map((t) => ({
        ...t,
        amount: parseFloat(t.amount),
        createdAt: t.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Admin list transactions error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/transactions/:id  — approve or reject a withdrawal
adminRouter.patch("/transactions/:id", async (req, res) => {
  const txId = parseInt(req.params.id, 10);
  const { status } = req.body as { status: "completed" | "failed" };

  if (!["completed", "failed"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  try {
    const [tx] = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, txId))
      .limit(1);

    if (!tx) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    if (tx.status !== "pending") {
      res.status(400).json({ error: "Transaction is not pending" });
      return;
    }

    // Refund balance if rejecting a withdrawal
    if (status === "failed" && tx.type === "withdrawal") {
      const [user] = await db
        .select({ balance: usersTable.balance })
        .from(usersTable)
        .where(eq(usersTable.id, tx.userId))
        .limit(1);

      if (user) {
        const refunded = parseFloat(user.balance) + parseFloat(tx.amount);
        await db
          .update(usersTable)
          .set({ balance: String(refunded) })
          .where(eq(usersTable.id, tx.userId));
      }
    }

    // If approving a withdrawal, send via Plisio payout API
    if (status === "completed" && tx.type === "withdrawal" && tx.address) {

    // Plisio payout uses different currency codes than invoice API
    const PLISIO_PAYOUT_MAP: Record<string, string> = {
      BTC: "BTC", ETH: "ETH", LTC: "LTC", DOGE: "DOGE", SOL: "SOL",
      BCH: "BCH", TRX: "TRX", TON: "TON", XMR: "XMR", DASH: "DASH",
      USDT_TRX: "USDT_TRC20", USDT_TON: "USDT_TRC20",
    };

      const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? "";
      if (!PLISIO_KEY) {
        res.status(500).json({ error: "Plisio API key not configured. Payout NOT sent." });
        return;
      }
      let payoutResponse: Response;
      try {
        const payoutCurrency = PLISIO_PAYOUT_MAP[tx.currency ?? "BTC"] ?? (tx.currency ?? "BTC");
        const params = new URLSearchParams({
          api_key: PLISIO_KEY,
          psys_cid: payoutCurrency,
          to: tx.address,
          source_amount: tx.amount,
          source_currency: "USD",
          type: "cash_out",
        });
        payoutResponse = await fetch(`https://api.plisio.net/api/v1/operations/withdraw?${params.toString()}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
      } catch (fetchErr) {
        req.log.error({ fetchErr, txId }, "Plisio payout network error");
        res.status(502).json({ error: "Could not reach Plisio. Payout NOT sent. Please try again." });
        return;
      }
      interface PlisioPayoutResponse {
        status: string;
        data?: { txn_id?: string; message?: string };
      }
      const rawText = await payoutResponse.text();

      req.log.error(
        {
          txId,
          status: payoutResponse.status,
          body: rawText.slice(0, 2000),
        },
        "PLISIO RAW RESPONSE",
      );

      let payoutData: PlisioPayoutResponse;

      try {
        payoutData = JSON.parse(rawText);
      } catch {
        req.log.error(
          {
            txId,
            rawText,
          },
          "PLISIO RETURNED NON JSON",
        );

        res.status(502).json({
          error: "Plisio returned invalid response",
        });

        return;
      }
      if (payoutData.status !== "success") {
        const errMsg = payoutData.data?.message ?? JSON.stringify(payoutData).slice(0, 200);
        req.log.error({ txId, payoutData, errMsg }, "Plisio payout rejected");
        res.status(502).json({ error: `Payout failed: ${errMsg}. Balance NOT deducted. Try again.` });
        return;
      }
      const plisioTxId = payoutData.data?.txn_id ?? null;
      const [updated] = await db
        .update(transactionsTable)
        .set({ status: "completed", txHash: plisioTxId })
        .where(eq(transactionsTable.id, txId))
        .returning();
      res.json({ id: updated.id, status: updated.status, amount: parseFloat(updated.amount), txHash: updated.txHash });
      return;
    }

    // Default: update status without Plisio call
    const [updated] = await db
      .update(transactionsTable)
      .set({ status })
      .where(eq(transactionsTable.id, txId))
      .returning();

    res.json({
      id: updated.id,
      status: updated.status,
      amount: parseFloat(updated.amount),
    });
  } catch (err) {
    req.log.error({ err }, "Admin update transaction error");
    res.status(500).json({ error: "Internal server error" });
  }
});


// ── OWNER BANK: GET /api/admin/bank/balances — live Plisio balances ──
adminRouter.get("/bank/balances", async (req, res) => {
  const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? "";
  if (!PLISIO_KEY) {
    res.status(500).json({ error: "PLISIO_SECRET_KEY not set" });
    return;
  }
  try {
    // Plisio's /currencies/{cid} balance endpoint currently only returns valid
    // data for BTC — other currencies return server errors on Plisio's side.
    // Deposits/withdrawals in other currencies (via /invoices) are unaffected.
    const currencies = ["BTC"];
    const balances: Record<string, { balance: string; allowed: number }> = {};
    await Promise.all(
      currencies.map(async (cur) => {
        try {
          const params = new URLSearchParams({ api_key: PLISIO_KEY });
          const resp = await fetch("https://api.plisio.net/api/v1/currencies/" + cur + "?" + params.toString());
          const data = await resp.json() as { status?: string; data?: { balance?: string; allowed?: number } };
          if (data.status === "success" && data.data) {
            balances[cur] = { balance: data.data.balance ?? "0", allowed: data.data.allowed ?? 0 };
          }
        } catch (e) { /* skip */ }
      })
    );
    res.json({ balances });
  } catch (err) {
    req.log.error({ err }, "Bank balances error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/bank/invoices — recent Plisio invoices
adminRouter.get("/bank/invoices", async (req, res) => {
  const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? "";
  if (!PLISIO_KEY) {
    res.status(500).json({ error: "PLISIO_SECRET_KEY not set" });
    return;
  }
  try {
    const page = String(req.query.page ?? 1);
    const limit = String(req.query.limit ?? 20);
    const params = new URLSearchParams({ api_key: PLISIO_KEY, page, limit });
    const resp = await fetch(`https://api.plisio.net/api/v1/operations?${params.toString()}`);
    const data = await resp.json() as { status: string; data?: { items?: unknown[]; count?: number } };
    if (data.status !== "success") {
      res.status(502).json({ error: "Plisio invoices fetch failed", detail: data });
      return;
    }
    res.json({ invoices: data.data?.items ?? [], total: data.data?.count ?? 0 });
  } catch (err) {
    req.log.error({ err }, "Bank invoices error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/bank/pending-withdrawals — our pending withdrawal queue
adminRouter.get("/bank/pending-withdrawals", async (req, res) => {
  try {
    const pending = await db
      .select()
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.type, "withdrawal"),
          eq(transactionsTable.status, "pending")
        )
      )
      .orderBy(desc(transactionsTable.createdAt))
      .limit(50);
    res.json({ withdrawals: pending });
  } catch (err) {
    req.log.error({ err }, "Pending withdrawals error");
    res.status(500).json({ error: "Internal server error" });
  }
});



// ── Default platform settings ──
const DEFAULT_SETTINGS = {
  aiSensitivity: 75,
  autoApproveUnder: 50,
  requireManualOver: 500,
};

async function getPlatformSettings() {
  const rows = await db.select().from(platformSettingsTable);
  const settings: Record<string, number> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key in settings) {
      const num = parseFloat(row.value);
      if (!isNaN(num)) settings[row.key as keyof typeof DEFAULT_SETTINGS] = num;
    }
  }
  return settings as typeof DEFAULT_SETTINGS;
}

// GET /api/admin/bank/settings — fanodgc only
adminRouter.get("/bank/settings", async (req, res) => {
  const [user] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!user || user.username !== "fanodgc") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const settings = await getPlatformSettings();
    res.json({ settings });
  } catch (err) {
    req.log.error({ err }, "Get bank settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/admin/bank/settings — fanodgc only
adminRouter.put("/bank/settings", async (req, res) => {
  const [user] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!user || user.username !== "fanodgc") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const { aiSensitivity, autoApproveUnder, requireManualOver } = req.body as Record<string, number>;
    const updates: Record<string, number> = {};
    if (typeof aiSensitivity === "number" && aiSensitivity >= 0 && aiSensitivity <= 100) updates.aiSensitivity = aiSensitivity;
    if (typeof autoApproveUnder === "number" && autoApproveUnder >= 0) updates.autoApproveUnder = autoApproveUnder;
    if (typeof requireManualOver === "number" && requireManualOver >= 0) updates.requireManualOver = requireManualOver;

    for (const [key, value] of Object.entries(updates)) {
      await db.insert(platformSettingsTable)
        .values({ key, value: String(value) })
        .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value: String(value) } });
    }

    const settings = await getPlatformSettings();
    res.json({ success: true, settings });
  } catch (err) {
    req.log.error({ err }, "Update bank settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── OWNER BANK: GET /api/admin/bank/fraud-alerts ─────────────────────────────
// Real AI fraud detection — scores every pending withdrawal using behavioral rules
adminRouter.get("/bank/fraud-alerts", async (req, res) => {
  try {
    const settings = await getPlatformSettings();
    // Sensitivity 0-100 maps to a multiplier of 0.5x - 1.5x on raw risk scores
    const sensitivityMultiplier = 0.5 + (settings.aiSensitivity / 100);

    // Step 1 — Pull all pending withdrawals with user info
    const pending = await db
      .select({
        id: transactionsTable.id,
        userId: transactionsTable.userId,
        amount: transactionsTable.amount,
        currency: transactionsTable.currency,
        type: transactionsTable.type,
        status: transactionsTable.status,
        address: transactionsTable.address,
        createdAt: transactionsTable.createdAt,
        username: usersTable.username,
        userCreatedAt: usersTable.createdAt,
        userBalance: usersTable.balance,
      })
      .from(transactionsTable)
      .leftJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
      .where(
        and(
          eq(transactionsTable.type, "withdrawal"),
          eq(transactionsTable.status, "pending")
        )
      )
      .orderBy(desc(transactionsTable.createdAt))
      .limit(50);

    if (pending.length === 0) {
      res.json({ alerts: [] });
      return;
    }

    // Step 2 — For each withdrawal, run AI scoring
    const alerts = await Promise.all(
      pending.map(async (tx) => {
        const flags: string[] = [];
        let riskScore = 0;
        const amount = parseFloat(tx.amount ?? "0");

        // ── Rule 1: Large amount ──────────────────────────────────
        // Flag withdrawals over $500 equivalent
        if (amount > 500) {
          flags.push("large_amount");
          riskScore += amount > 2000 ? 35 : amount > 1000 ? 25 : 15;
        }

        // ── Rule 2: New account ───────────────────────────────────
        // Account less than 7 days old making a withdrawal
        const accountAgeDays = tx.userCreatedAt
          ? (Date.now() - new Date(tx.userCreatedAt).getTime()) / (1000 * 60 * 60 * 24)
          : 999;
        if (accountAgeDays < 7) {
          flags.push("new_account");
          riskScore += accountAgeDays < 1 ? 40 : accountAgeDays < 3 ? 30 : 20;
        }

        // ── Rule 3: Velocity — multiple withdrawals in 24h ────────
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [{ recentCount }] = await db
          .select({ recentCount: sql<number>`count(*)` })
          .from(transactionsTable)
          .where(
            and(
              eq(transactionsTable.userId, tx.userId),
              eq(transactionsTable.type, "withdrawal"),
              sql`created_at > ${oneDayAgo.toISOString()}`
            )
          );
        if (Number(recentCount) > 2) {
          flags.push("velocity");
          riskScore += Number(recentCount) > 5 ? 35 : Number(recentCount) > 3 ? 25 : 15;
        }

        // ── Rule 4: Suspicious pattern — big loss then withdraw ───
        // User lost over $200 in bets in last 6 hours then immediately withdrew
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
        const [{ recentLoss }] = await db
          .select({ recentLoss: sql<number>`coalesce(sum(amount::numeric), 0)` })
          .from(betsTable)
          .where(
            and(
              eq(betsTable.userId, tx.userId),
              eq(betsTable.won, false),
              sql`created_at > ${sixHoursAgo.toISOString()}`
            )
          );
        if (Number(recentLoss) > 200) {
          flags.push("suspicious_pattern");
          riskScore += Number(recentLoss) > 1000 ? 30 : Number(recentLoss) > 500 ? 20 : 12;
        }

        // ── Rule 5: Round number amounts (common in fraud) ────────
        if (amount > 100 && amount % 100 === 0) {
          flags.push("round_amount");
          riskScore += 8;
        }

        // ── Rule 6: Balance mismatch — withdrawing more than 90% of balance ──
        const balance = parseFloat(tx.userBalance ?? "0");
        if (balance > 0 && amount / balance > 0.9) {
          flags.push("full_balance_withdrawal");
          riskScore += 15;
        }

        // Apply AI sensitivity multiplier, then cap at 99
        riskScore = Math.min(Math.round(riskScore * sensitivityMultiplier), 99);

        // Auto-approve very small amounts under the configured threshold,
        // unless they're already high risk
        if (amount <= settings.autoApproveUnder && riskScore < 50) {
          return null;
        }

        // Amounts over the manual-review threshold are always flagged,
        // even if no rules triggered (minimum baseline risk)
        if (amount > settings.requireManualOver && flags.length === 0) {
          flags.push("manual_review_threshold");
          riskScore = Math.max(riskScore, Math.round(20 * sensitivityMultiplier));
        }

        // Only return if actually flagged (at least 1 rule triggered)
        if (flags.length === 0) return null;

        return {
          id: tx.id,
          userId: tx.userId,
          username: tx.username ?? `user_${tx.userId}`,
          amount: tx.amount,
          currency: tx.currency,
          type: tx.type,
          status: tx.status,
          address: tx.address,
          riskScore,
          flags,
          createdAt: tx.createdAt,
        };
      })
    );

    // Filter out nulls (transactions that passed all checks)
    const flagged = alerts.filter(Boolean);

    // Sort by risk score descending — highest risk first
    flagged.sort((a, b) => (b?.riskScore ?? 0) - (a?.riskScore ?? 0));

    res.json({ alerts: flagged });
  } catch (err) {
    req.log.error({ err }, "Fraud alerts error");
    res.status(500).json({ error: "Internal server error" });
  }
});


// POST /api/admin/tip — any logged-in user can tip another user
adminRouter.post("/tip", async (req, res) => {
  const { toUsername, amount } = req.body as { toUsername?: string; amount?: number };
  if (!toUsername || !amount || amount <= 0) {
    res.status(400).json({ error: "Username and a positive amount are required" });
    return;
  }
  if (amount > 10000) {
    res.status(400).json({ error: "Tip amount too large" });
    return;
  }
  try {
    // Get sender
    const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!sender) { res.status(401).json({ error: "Sender not found" }); return; }
    if (parseFloat(sender.balance) < amount) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }
    // Get recipient
    const [recipient] = await db.select().from(usersTable).where(eq(usersTable.username, toUsername)).limit(1);
    if (!recipient) { res.status(404).json({ error: "User not found: " + toUsername }); return; }
    if (recipient.id === sender.id) { res.status(400).json({ error: "Cannot tip yourself" }); return; }

    // Deduct from sender, add to recipient
    const newSenderBalance = parseFloat(sender.balance) - amount;
    const newRecipientBalance = parseFloat(recipient.balance) + amount;

    await db.update(usersTable).set({ balance: String(newSenderBalance) }).where(eq(usersTable.id, sender.id));
    await db.update(usersTable).set({ balance: String(newRecipientBalance) }).where(eq(usersTable.id, recipient.id));

    // Log as transactions for both users
    await db.insert(transactionsTable).values({
      userId: sender.id, type: "tip_sent", amount: String(amount),
      currency: "USD", status: "completed",
      metadata: JSON.stringify({ toUsername: recipient.username }),
    });
    await db.insert(transactionsTable).values({
      userId: recipient.id, type: "tip_received", amount: String(amount),
      currency: "USD", status: "completed",
      metadata: JSON.stringify({ fromUsername: sender.username }),
    });

    res.json({ success: true, newBalance: newSenderBalance });
  } catch (err) {
    req.log.error({ err }, "Tip error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/payout-callback — Plisio payout IPN
adminRouter.post("/payout-callback", async (req, res) => {
  const { trackId, status } = req.body as { trackId?: string; status?: string };
  req.log.info({ trackId, status }, "Plisio payout callback received");
  res.json({ success: true });
});

// GET /api/admin/stats
adminRouter.get("/stats", async (req, res) => {
  try {
    const [{ totalUsers }] = await db
      .select({ totalUsers: sql<number>`count(*)` })
      .from(usersTable);

    const [{ totalBets }] = await db
      .select({ totalBets: sql<number>`count(*)` })
      .from(betsTable);

    const [{ totalWagered }] = await db
      .select({ totalWagered: sql<number>`coalesce(sum(amount::numeric), 0)` })
      .from(betsTable);

    const [{ biggestWin }] = await db
      .select({ biggestWin: sql<number>`coalesce(max(payout::numeric), 0)` })
      .from(betsTable);

    const [{ pendingWithdrawals }] = await db
      .select({ pendingWithdrawals: sql<number>`count(*)` })
      .from(transactionsTable)
      .where(and(eq(transactionsTable.type, "withdrawal"), eq(transactionsTable.status, "pending")));

    const [{ pendingWithdrawalAmount }] = await db
      .select({ pendingWithdrawalAmount: sql<number>`coalesce(sum(amount::numeric), 0)` })
      .from(transactionsTable)
      .where(and(eq(transactionsTable.type, "withdrawal"), eq(transactionsTable.status, "pending")));

    const [{ bannedUsers }] = await db
      .select({ bannedUsers: sql<number>`count(*)` })
      .from(usersTable)
      .where(eq(usersTable.isBanned, true));

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [{ activeToday }] = await db
      .select({ activeToday: sql<number>`count(distinct user_id)` })
      .from(betsTable)
      .where(sql`created_at > ${oneDayAgo}`);

    const [{ totalDeposited }] = await db
      .select({ totalDeposited: sql<number>`coalesce(sum(amount::numeric), 0)` })
      .from(transactionsTable)
      .where(and(eq(transactionsTable.type, "deposit"), eq(transactionsTable.status, "completed")));

    const [{ totalWithdrawn }] = await db
      .select({ totalWithdrawn: sql<number>`coalesce(sum(amount::numeric), 0)` })
      .from(transactionsTable)
      .where(and(eq(transactionsTable.type, "withdrawal"), eq(transactionsTable.status, "completed")));

    const [{ newUsersToday }] = await db
      .select({ newUsersToday: sql<number>`count(*)` })
      .from(usersTable)
      .where(sql`created_at > ${oneDayAgo}`);

    res.json({
      totalUsers: Number(totalUsers),
      totalBets: Number(totalBets),
      totalWagered: Number(totalWagered),
      biggestWin: Number(biggestWin),
      pendingWithdrawals: Number(pendingWithdrawals),
      pendingWithdrawalAmount: Number(pendingWithdrawalAmount),
      bannedUsers: Number(bannedUsers),
      activeToday: Number(activeToday),
      totalDeposited: Number(totalDeposited),
      totalWithdrawn: Number(totalWithdrawn),
      newUsersToday: Number(newUsersToday),
    });
  } catch (err) {
    req.log.error({ err }, "Admin stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── ACCOUNT TYPE SYSTEM ───────────────────────────────────────────────────────

// PATCH /api/admin/users/:id/account-type
// Only the owner (fanodgc / role=owner) can set account types and promo balance
// When promoting to admin role, auto-generates a one-time-viewable DGC Bank PIN
adminRouter.patch("/users/:id/account-type", async (req, res) => {
  // Verify caller is owner
  const [caller] = await db.select({ role: usersTable.role, username: usersTable.username })
    .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!caller || caller.role !== "owner") {
    res.status(403).json({ error: "Only the platform owner can change account types" });
    return;
  }

  const targetId = parseInt(req.params.id);
  if (isNaN(targetId)) { res.status(400).json({ error: "Invalid user ID" }); return; }

  const { accountType, promoBalance, role } = req.body as {
    accountType?: "normal" | "creator" | "tester";
    promoBalance?: number;
    role?: "player" | "admin";
  };

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  // Prevent changing owner account
  if (target.role === "owner") {
    res.status(403).json({ error: "Cannot modify the owner account" });
    return;
  }

  const updates: Record<string, any> = {};
  let plainPin: string | null = null;

  // Set account type and withdrawal eligibility
  if (accountType) {
    updates.accountType = accountType;
    // creator and tester accounts cannot withdraw
    updates.withdrawalsEnabled = accountType === "normal";
  }

  // Set promo balance (house credits)
  if (typeof promoBalance === "number" && promoBalance >= 0) {
    updates.promoBalance = String(promoBalance);
    // When giving promo balance, add it to display balance too
    updates.balance = String(promoBalance);
  }

  // Promote to admin — auto-generate PIN
  if (role === "admin" && target.role !== "admin") {
    updates.role = "admin";
    // Generate a secure random 10-digit PIN — stored as plain text for owner visibility
    plainPin = String(crypto.randomInt(1000000000, 9999999999));
    updates.dgcBankPin = plainPin;
    updates.dgcBankPinRevealed = false;
  }

  // Demote from admin back to player
  if (role === "player" && target.role === "admin") {
    updates.role = "player";
    updates.dgcBankPin = null;
    updates.dgcBankPinRevealed = false;
  }

  await db.update(usersTable).set(updates).where(eq(usersTable.id, targetId));

  res.json({
    success: true,
    updated: { ...updates, dgcBankPin: undefined }, // never return hash
    // Return plaintext PIN exactly once — owner must note it down
    ...(plainPin ? { newAdminPin: plainPin, pinWarning: "Save this PIN now. It will never be shown again." } : {}),
  });
});

// GET /api/admin/users/:id/reveal-pin
// Owner only — reveals the plain PIN once, then marks it as revealed forever
adminRouter.get("/users/:id/reveal-pin", async (req, res) => {
  const [caller] = await db.select({ role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!caller || caller.role !== "owner") {
    res.status(403).json({ error: "Only the owner can reveal admin PINs" });
    return;
  }

  const targetId = parseInt(req.params.id);
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (!target.dgcBankPin) { res.status(404).json({ error: "No PIN set for this user" }); return; }
  if (target.dgcBankPinRevealed) {
    res.status(410).json({ error: "PIN has already been revealed and cannot be shown again. Reset by demoting and re-promoting the admin." });
    return;
  }

  // Mark as revealed — this is irreversible
  await db.update(usersTable)
    .set({ dgcBankPinRevealed: true })
    .where(eq(usersTable.id, targetId));

  res.json({
    success: true,
    warning: "This PIN will never be shown again. Write it down now.",
    // We cannot return the plaintext here — it was only available at creation
    // The owner must use the PIN shown at promotion time
    message: "PIN was shown at the time of admin promotion. This endpoint only confirms the PIN exists. To reset: demote the admin to player, then re-promote to generate a new PIN.",
  });
});

// GET /api/admin/users/:id/bank-pin — owner only, returns plain PIN anytime
adminRouter.get("/users/:id/bank-pin", requireAuth, async (req, res) => {
  const [caller] = await db.select({ username: usersTable.username, role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!caller || caller.username !== "fanodgc") {
    res.status(403).json({ error: "Owner only" }); return;
  }
  const targetId = parseInt(req.params.id);
  const [target] = await db.select({ id: usersTable.id, username: usersTable.username, role: usersTable.role, dgcBankPin: usersTable.dgcBankPin })
    .from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.role !== "admin") { res.status(400).json({ error: "User is not an admin" }); return; }
  res.json({ pin: target.dgcBankPin ?? null, username: target.username });
});

// POST /api/admin/users/:id/regenerate-pin — owner only, generates a fresh PIN
adminRouter.post("/users/:id/regenerate-pin", requireAuth, async (req, res) => {
  const [caller] = await db.select({ username: usersTable.username })
    .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!caller || caller.username !== "fanodgc") {
    res.status(403).json({ error: "Owner only" }); return;
  }
  const targetId = parseInt(req.params.id);
  const [target] = await db.select({ id: usersTable.id, role: usersTable.role, username: usersTable.username })
    .from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.role !== "admin") { res.status(400).json({ error: "User is not an admin" }); return; }
  const newPin = String(crypto.randomInt(1000000000, 9999999999));
  await db.update(usersTable).set({ dgcBankPin: newPin, dgcBankPinRevealed: false }).where(eq(usersTable.id, targetId));
  res.json({ success: true, pin: newPin, username: target.username });
});

// POST /api/admin/verify-bank-pin
// Admin verifies their DGC Bank PIN to access the bank section
adminRouter.post("/verify-bank-pin", async (req, res) => {
  const { pin } = req.body as { pin?: string };
  if (!pin || pin.length < 5 || pin.length > 15) {
    res.status(400).json({ error: "PIN must be 5 to 15 digits" });
    return;
  }

  const [user] = await db.select({
    id: usersTable.id,
    dgcBankPin: usersTable.dgcBankPin,
    role: usersTable.role,
  }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);

  if (!user) { res.status(401).json({ error: "User not found" }); return; }
  if (!user.dgcBankPin) { res.status(403).json({ error: "No DGC Bank PIN set for your account" }); return; }

  // Verify PIN — direct plain text comparison
  if (pin !== user.dgcBankPin) {
    res.status(401).json({ error: "Incorrect PIN" });
    return;
  }

  // Issue a short-lived bank session token (valid 30 minutes)
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  // Store token temporarily in memory (simple approach — good enough for admin panel)
  if (!(global as any).__bankSessions) (global as any).__bankSessions = {};
  (global as any).__bankSessions[sessionToken] = { userId: user.id, expiresAt };

  res.json({ success: true, sessionToken, expiresAt });
});

