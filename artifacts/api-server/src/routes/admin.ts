import { Router } from "express";
import { db, usersTable, betsTable, transactionsTable } from "@workspace/db";
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
      const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? "";
      if (!PLISIO_KEY) {
        res.status(500).json({ error: "Plisio API key not configured. Payout NOT sent." });
        return;
      }
      let payoutResponse: Response;
      try {
        const params = new URLSearchParams({
          api_key: PLISIO_KEY,
          currency: tx.currency ?? "BTC",
          to: tx.address,
          amount: tx.amount,
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
      const payoutData = (await payoutResponse.json()) as PlisioPayoutResponse;
      if (payoutData.status !== "success") {
        req.log.error({ txId, payoutData }, "Plisio payout rejected");
        res.status(502).json({ error: `Plisio payout failed: ${payoutData.data?.message ?? "Unknown error"}. Payout NOT sent.` });
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
    const params = new URLSearchParams({ api_key: PLISIO_KEY });
    const resp = await fetch(`https://api.plisio.net/api/v1/balances?${params.toString()}`);
    const data = await resp.json() as { status: string; data?: Record<string, { balance: string; allowed: number }> };
    if (data.status !== "success") {
      res.status(502).json({ error: "Plisio balances fetch failed", detail: data });
      return;
    }
    res.json({ balances: data.data ?? {} });
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

    res.json({
      totalUsers: Number(totalUsers),
      totalBets: Number(totalBets),
      totalWagered: Number(totalWagered),
      biggestWin: Number(biggestWin),
      pendingWithdrawals: Number(pendingWithdrawals),
      pendingWithdrawalAmount: Number(pendingWithdrawalAmount),
      bannedUsers: Number(bannedUsers),
    });
  } catch (err) {
    req.log.error({ err }, "Admin stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});
