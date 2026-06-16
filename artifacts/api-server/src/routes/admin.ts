import { Router } from "express";
import crypto from "crypto";
import { db, usersTable, betsTable, transactionsTable, platformSettingsTable, tournamentsTable, tournamentEntriesTable, adminMessagesTable, creatorMessagesTable, creatorMessageReadsTable, fraudReviewsTable } from "@workspace/db";
import { eq, desc, ilike, and, sql, count, or, gt, ne } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth.js";
import { getPlatformSettings } from "../lib/platform-settings.js";
import { logAudit } from "../services/audit.js";
import { recordLedger, recordLedgerStandalone } from "../services/ledger.js";
import { sendPlisioPayout } from "../lib/plisio-payout.js";

export const adminRouter = Router();

adminRouter.use(requireAdmin);

// ── Owner identity ──
// There is exactly one platform owner, identified by username "fanodgc".
// Centralized here so owner checks never drift between username/role again.
const OWNER_USERNAME = "fanodgc";
async function callerIsOwner(req: { user?: { userId: number } }): Promise<boolean> {
  const [caller] = await db
    .select({ username: usersTable.username })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.userId))
    .limit(1);
  return (caller?.username ?? "").toLowerCase() === OWNER_USERNAME;
}

// True if the target row is the protected platform owner. Matches by case-insensitive
// username OR the "owner" role so no mutation path can ever ban/demote/delete/modify it.
function isOwnerAccount(
  target: { username?: string | null; role?: string | null } | undefined | null,
): boolean {
  if (!target) return false;
  return target.role === "owner" || (target.username ?? "").toLowerCase() === OWNER_USERNAME;
}

// Generates a 10-digit DGC Bank PIN guaranteed not to collide with an existing one.
async function generateUniqueBankPin(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const pin = String(crypto.randomInt(1000000000, 9999999999));
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.dgcBankPin, pin))
      .limit(1);
    if (!existing) return pin;
  }
  throw new Error("Unable to generate a unique DGC Bank PIN");
}

// ── DGC Bank PIN session gate ──
// The platform owner (fanodgc) has permanent, PIN-free access to the bank.
// All other admins must present a valid bank session token (from /verify-bank-pin).
async function requireBankSession(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): Promise<void> {
  // Owner bypass — no PIN ever required for fanodgc
  const [caller] = await db
    .select({ username: usersTable.username })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.userId))
    .limit(1);
  if ((caller?.username ?? "").toLowerCase() === OWNER_USERNAME) {
    next();
    return;
  }

  // Non-owner admins require a live bank session token
  const token = req.header("x-bank-session");
  if (!token) {
    res.status(401).json({ error: "DGC Bank locked. Enter your PIN to continue.", code: "BANK_LOCKED" });
    return;
  }
  const sessions = ((global as any).__bankSessions ??= {}) as Record<
    string,
    { userId: number; expiresAt: string }
  >;
  const sess = sessions[token];
  if (!sess) {
    res.status(401).json({ error: "DGC Bank locked. Enter your PIN to continue.", code: "BANK_LOCKED" });
    return;
  }
  if (new Date(sess.expiresAt).getTime() <= Date.now()) {
    delete sessions[token];
    res.status(401).json({ error: "DGC Bank session expired. Enter your PIN again.", code: "BANK_EXPIRED" });
    return;
  }
  if (sess.userId !== req.user!.userId) {
    res.status(403).json({ error: "Bank session does not match your account." });
    return;
  }
  next();
}


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
        accountType: user.accountType,
        withdrawalsEnabled: user.withdrawalsEnabled,
        promoBalance: parseFloat(user.promoBalance),
        totalDeposited: parseFloat(user.totalDeposited),
        totalWageredAmount: parseFloat(user.totalWageredAmount),
        // ── Location / geo ──
        locationVerified: user.locationVerified,
        geoIp: user.geoIp,
        geoCountry: user.geoCountry,
        geoCountryCode: user.geoCountryCode,
        geoRegion: user.geoRegion,
        geoCity: user.geoCity,
        geoHostname: user.geoHostname,
        geoAsn: user.geoAsn,
        geoIsp: user.geoIsp,
        geoLat: user.geoLat,
        geoLon: user.geoLon,
        geoTimezone: user.geoTimezone,
        vpnDetected: user.vpnDetected,
        vpnProvider: user.vpnProvider,
        // ── Device ──
        deviceFingerprint: user.deviceFingerprint,
        deviceName: user.deviceName,
        deviceOs: user.deviceOs,
        deviceBrowser: user.deviceBrowser,
        deviceType: user.deviceType,
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
  // Only the owner may create admin accounts (and therefore see a new admin's PIN).
  if (role === "admin" && !(await callerIsOwner(req))) {
    res.status(403).json({ error: "Only the owner can create admin accounts." });
    return;
  }

  try {
    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 12);
    const isAdminRole = role === "admin";
    // New admins get a unique DGC Bank PIN immediately so they can be granted access.
    const newAdminPin = isAdminRole ? await generateUniqueBankPin() : null;
    const [created] = await db
      .insert(usersTable)
      .values({
        username,
        passwordHash,
        role: isAdminRole ? "admin" : "player",
        balance: String(balance ?? 0),
        dgcBankPin: newAdminPin,
        dgcBankPinRevealed: false,
      })
      .returning();

    res.json({
      id: created.id,
      username: created.username,
      role: created.role,
      balance: parseFloat(created.balance),
      ...(newAdminPin ? { newAdminPin } : {}),
    });
  } catch (err: unknown) {
    // Drizzle wraps the underlying pg error, so the unique-violation signal
    // (code 23505 / "unique constraint") lives on err.cause, not err.message.
    const e = err as { message?: string; code?: string; cause?: { message?: string; code?: string } };
    const combined = `${e.message ?? ""} ${e.cause?.message ?? ""}`;
    const code = e.code ?? e.cause?.code;
    if (code === "23505" || combined.includes("unique")) {
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
  const [target] = await db
    .select({ username: usersTable.username, role: usersTable.role, dgcBankPin: usersTable.dgcBankPin })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (isOwnerAccount(target)) {
    res.status(403).json({ error: "This account is protected and cannot be modified." });
    return;
  }
  // Only the owner can change a user's role (promote/demote admin status).
  if (role !== undefined && role !== target?.role && !(await callerIsOwner(req))) {
    res.status(403).json({ error: "Only the owner can change a user's role." });
    return;
  }

  try {
    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (balance !== undefined) updates.balance = String(balance);
    if (role !== undefined) updates.role = role;
    if (isBanned !== undefined) updates.isBanned = isBanned;

    // Keep DGC Bank PINs in sync with admin status, regardless of promotion path.
    if (role === "admin" && target && !target.dgcBankPin) {
      // Promoting to admin and no PIN yet — generate a unique one.
      updates.dgcBankPin = await generateUniqueBankPin();
      updates.dgcBankPinRevealed = false;
    } else if (role === "player" && target?.role === "admin") {
      // Demoting an admin — revoke their bank PIN.
      updates.dgcBankPin = null;
      updates.dgcBankPinRevealed = false;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const [before] = await db.select({ balance: usersTable.balance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, userId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Audit log — fire-and-forget
    logAudit({
      adminId: req.user!.userId,
      adminUsername: (await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1))[0]?.username ?? "admin",
      action: isBanned !== undefined ? (isBanned ? "ban_user" : "unban_user") : role !== undefined ? "change_role" : "adjust_balance",
      targetType: "user",
      targetId: userId,
      oldValue: { balance: parseFloat(before?.balance ?? "0"), role: target?.role, isBanned: false },
      newValue: { balance: parseFloat(updated.balance), role: updated.role, isBanned: updated.isBanned },
      ip: req.ip,
    }).catch(() => {});

    // If balance was manually set, record a ledger entry
    if (balance !== undefined && before) {
      const oldBal = parseFloat(before.balance);
      const newBal = parseFloat(updated.balance);
      recordLedgerStandalone({
        userId,
        amount: newBal - oldBal,
        balanceBefore: oldBal,
        balanceAfter: newBal,
        reason: "admin_adjustment",
        note: `Admin balance set to ${newBal} by admin #${req.user!.userId}`,
      }).catch(() => {});
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
  const [target] = await db.select({ username: usersTable.username, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (isOwnerAccount(target)) {
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
adminRouter.get("/transactions", requireBankSession, async (req, res) => {
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
        plisioTrackId: transactionsTable.plisioTrackId,
        orderId: transactionsTable.orderId,
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
// Requires an unlocked DGC Bank session — approvals only happen inside the bank.
adminRouter.patch("/transactions/:id", requireBankSession, async (req, res) => {
  const txId = parseInt(String(req.params.id), 10);
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

    // Reject a withdrawal → refund the held balance. Idempotent + transactional: the
    // guarded status flip (pending -> failed) gates the refund inside one DB transaction,
    // so concurrent/duplicate rejects block on the row lock and can't double-refund.
    if (status === "failed" && tx.type === "withdrawal") {
      const refundAmount = parseFloat(tx.amount);
      const refunded = await db.transaction(async (txn) => {
        const flipped = await txn
          .update(transactionsTable)
          .set({ status: "failed" })
          .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.status, "pending")))
          .returning({ id: transactionsTable.id });
        if (flipped.length === 0) return false;
        const [userAfter] = await txn
          .update(usersTable)
          .set({ balance: sql`balance + ${refundAmount}` })
          .where(eq(usersTable.id, tx.userId))
          .returning({ balance: usersTable.balance });
        if (userAfter) {
          const balanceAfter = parseFloat(userAfter.balance);
          await recordLedger(txn, {
            userId: tx.userId,
            amount: refundAmount,
            balanceBefore: balanceAfter - refundAmount,
            balanceAfter,
            reason: "withdrawal_refund",
            referenceId: txId,
            referenceType: "transaction",
            note: `Withdrawal rejected by admin #${req.user!.userId}`,
          });
        }
        return true;
      });
      if (!refunded) {
        res.status(400).json({ error: "Transaction is not pending" });
        return;
      }
      // Audit log
      logAudit({
        adminId: req.user!.userId,
        adminUsername: (await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1))[0]?.username ?? "admin",
        action: "reject_withdrawal",
        targetType: "transaction",
        targetId: txId,
        oldValue: { status: "pending", amount: refundAmount },
        newValue: { status: "failed" },
        ip: req.ip,
        note: `Refunded $${refundAmount} to user #${tx.userId}`,
      }).catch(() => {});
      res.json({ id: txId, status: "failed", amount: refundAmount });
      return;
    }

    // A withdrawal must have a payout address; never silently mark it completed
    // without sending funds. Fail loudly so the owner can reject + refund instead.
    if (status === "completed" && tx.type === "withdrawal" && !tx.address) {
      res.status(400).json({
        error: "This withdrawal has no payout address; funds were NOT sent. Reject it to refund the user.",
      });
      return;
    }

    // If approving a withdrawal, send via Plisio payout API (shared helper)
    if (status === "completed" && tx.type === "withdrawal" && tx.address) {
      const result = await sendPlisioPayout(txId, req.log);
      switch (result.outcome) {
        case "completed":
          // Audit log — withdrawal approved via Plisio
          logAudit({
            adminId: req.user!.userId,
            adminUsername: (await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1))[0]?.username ?? "admin",
            action: "approve_withdrawal",
            targetType: "transaction",
            targetId: txId,
            oldValue: { status: "pending", amount: parseFloat(tx.amount) },
            newValue: { status: "completed", txHash: result.txHash },
            ip: req.ip,
          }).catch(() => {});
          res.json({ id: result.id, status: "completed", amount: result.amount, txHash: result.txHash });
          return;
        case "needs_review":
          res.status(502).json({ error: result.message });
          return;
        case "reverted_pending":
          res.status(502).json({ error: result.message });
          return;
        case "already_processing":
          res.status(409).json({ error: "This withdrawal is already being processed." });
          return;
        case "no_key":
          res.status(500).json({ error: "Plisio API key not configured. Payout NOT sent." });
          return;
        case "no_address":
          res.status(400).json({ error: "This withdrawal has no payout address." });
          return;
      }
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


// Look up a single Plisio operation by id to learn whether a payout actually went out. Used by
// the reconcile flow as a server-side safety check before refunding/requeuing money (and surfaced
// to the owner in the UI). Returns sent=true if Plisio reports it completed, sent=false if Plisio
// reports it failed/cancelled, sent=null if pending/unknown, and found=false when there is no
// reference or Plisio could not confirm. Only POSITIVE evidence (sent true/null) is acted on as a
// hard stop — an inconclusive result falls back to the owner's dashboard-based judgement.
type PlisioOpStatus = { found: boolean; status?: string; sent: boolean | null; reason?: string };
async function fetchPlisioOperationStatus(operationId: string): Promise<PlisioOpStatus> {
  const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? "";
  if (!PLISIO_KEY) return { found: false, sent: null, reason: "no_key" };
  if (!operationId) return { found: false, sent: null, reason: "no_reference" };
  try {
    const params = new URLSearchParams({ api_key: PLISIO_KEY });
    const resp = await fetch(
      `https://api.plisio.net/api/v1/operations/${encodeURIComponent(operationId)}?${params.toString()}`,
      { method: "GET", signal: AbortSignal.timeout(15_000) },
    );
    const data = (await resp.json()) as { status?: string; data?: { status?: string } };
    if (data.status !== "success" || !data.data) {
      return { found: false, sent: null, reason: "not_found" };
    }
    const opStatus = String(data.data.status ?? "").toLowerCase();
    let sent: boolean | null;
    if (opStatus === "completed") sent = true;
    else if (opStatus === "error" || opStatus === "cancelled" || opStatus === "canceled") sent = false;
    else sent = null; // pending / new / unknown — not yet confirmed, unsafe to refund/requeue
    return { found: true, status: opStatus, sent };
  } catch {
    return { found: false, sent: null, reason: "lookup_failed" };
  }
}

// ── RECONCILE: withdrawals stuck in an ambiguous state ──────────────────────
// A withdrawal lands in `needs_review` when a Plisio payout outcome was ambiguous (network
// error, non-JSON, or an error that still returned a payout reference), or it can be left
// in `processing` if the server died mid-payout. These rows have ALREADY had the user's
// balance deducted, so the owner must verify in Plisio and resolve them explicitly.

// GET /api/admin/transactions/needs-review — the reconcile queue
adminRouter.get("/transactions/needs-review", requireBankSession, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: transactionsTable.id,
        userId: transactionsTable.userId,
        amount: transactionsTable.amount,
        currency: transactionsTable.currency,
        type: transactionsTable.type,
        status: transactionsTable.status,
        address: transactionsTable.address,
        txHash: transactionsTable.txHash,
        createdAt: transactionsTable.createdAt,
        updatedAt: transactionsTable.updatedAt,
        username: usersTable.username,
      })
      .from(transactionsTable)
      .leftJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
      .where(
        and(
          eq(transactionsTable.type, "withdrawal"),
          // `processing` rows younger than 5 min may be a payout in flight RIGHT NOW —
          // exclude them so we never surface (or let the owner touch) an in-progress payout.
          sql`(${transactionsTable.status} = 'needs_review' OR (${transactionsTable.status} = 'processing' AND ${transactionsTable.updatedAt} < now() - interval '5 minutes'))`,
        ),
      )
      .orderBy(desc(transactionsTable.updatedAt))
      .limit(100);
    res.json({ withdrawals: rows });
  } catch (err) {
    req.log.error({ err }, "Needs-review withdrawals error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/transactions/:id/plisio-status — ask Plisio directly whether this payout went
// out, so the owner can decide how to reconcile without leaving for the Plisio dashboard. Only
// works when we retained a payout reference (txHash); otherwise reports found:false.
adminRouter.get("/transactions/:id/plisio-status", requireBankSession, async (req, res) => {
  const txId = parseInt(String(req.params.id), 10);
  if (Number.isNaN(txId)) {
    res.status(400).json({ error: "Invalid transaction id" });
    return;
  }
  try {
    const [tx] = await db
      .select({ id: transactionsTable.id, txHash: transactionsTable.txHash, type: transactionsTable.type })
      .from(transactionsTable)
      .where(eq(transactionsTable.id, txId))
      .limit(1);
    if (!tx || tx.type !== "withdrawal") {
      res.status(404).json({ error: "Withdrawal not found" });
      return;
    }
    if (!tx.txHash) {
      res.json({ found: false, sent: null, reason: "no_reference", operationId: null });
      return;
    }
    const status = await fetchPlisioOperationStatus(tx.txHash);
    res.json({ ...status, operationId: tx.txHash });
  } catch (err) {
    req.log.error({ err }, "Plisio operation status lookup error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/transactions/:id/reconcile — resolve an ambiguous withdrawal
// Body: { resolution: "mark_completed" | "cancel_refund" | "requeue", txHash?, confirmedNotSent? }
adminRouter.post("/transactions/:id/reconcile", requireBankSession, async (req, res) => {
  const txId = parseInt(String(req.params.id), 10);
  if (Number.isNaN(txId)) {
    res.status(400).json({ error: "Invalid transaction id" });
    return;
  }
  const { resolution, txHash, confirmedNotSent } = req.body as {
    resolution?: string;
    txHash?: string;
    confirmedNotSent?: boolean;
  };
  if (!["mark_completed", "cancel_refund", "requeue"].includes(resolution ?? "")) {
    res.status(400).json({ error: "Invalid resolution" });
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
    if (tx.type !== "withdrawal") {
      res.status(400).json({ error: "Only withdrawals can be reconciled" });
      return;
    }
    if (tx.status !== "needs_review" && tx.status !== "processing") {
      res.status(400).json({ error: "This withdrawal is not awaiting review." });
      return;
    }
    // A 'processing' row may be an in-flight payout at Plisio right now. Only allow it to be
    // reconciled once it's been stuck long enough (>5 min) that the payout call has certainly
    // returned — mirrors the GET queue filter — so we never resolve a payout Plisio is about
    // to confirm (which would risk a refund/cancel on money that actually went out).
    if (tx.status === "processing") {
      const updatedAtMs = tx.updatedAt ? new Date(tx.updatedAt).getTime() : 0;
      if (Date.now() - updatedAtMs < 5 * 60 * 1000) {
        res.status(409).json({
          error:
            "This payout may still be in flight (processing for under 5 minutes). Wait until it appears in the Needs Review list before reconciling.",
        });
        return;
      }
    }

    // Shared guard: only a row STILL reconcilable may be resolved — needs_review always, but a
    // 'processing' row only once it is older than 5 min (an in-flight payout is younger). Mirrors
    // the GET queue filter. Combined with RETURNING, every resolution is idempotent and
    // TOCTOU-safe — a duplicate or in-flight-racing request finds 0 rows and is rejected (409),
    // so there is no double refund / double state change / resolving a live payout.
    const reconcilable = sql`(${transactionsTable.status} = 'needs_review' OR (${transactionsTable.status} = 'processing' AND ${transactionsTable.updatedAt} < now() - interval '5 minutes'))`;

    // Server-side safety net (on top of the owner's dashboard check): the two resolutions that
    // move money on the assumption the payout did NOT go out — cancel_refund (refund) and requeue
    // (pay again) — are the double-pay/loss risk. When we retained a Plisio reference, ask Plisio
    // directly and HARD-STOP on positive evidence the payout went out (sent) or is still pending
    // (unconfirmed). A confirmed failure, a missing reference, or an unreachable Plisio is
    // inconclusive and falls through to the human-gated path below — we never auto-loosen.
    if ((resolution === "cancel_refund" || resolution === "requeue") && tx.txHash) {
      const op = await fetchPlisioOperationStatus(tx.txHash);
      if (op.found && op.sent === true) {
        req.log.warn({ txId, op }, "Reconcile blocked: Plisio reports payout was sent");
        res.status(409).json({
          error: 'Plisio shows this payout WAS sent. Do NOT cancel/refund or retry — use "Sent" to mark it completed.',
          plisio: op,
        });
        return;
      }
      if (op.found && op.sent === null) {
        req.log.warn({ txId, op }, "Reconcile blocked: Plisio payout still pending");
        res.status(409).json({
          error: `Plisio shows this payout is still '${op.status}'. Wait until it settles, then re-check before cancel/refund or retry.`,
          plisio: op,
        });
        return;
      }
    }

    if (resolution === "mark_completed") {
      // Owner verified in Plisio the payout WAS sent. Funds were deducted at request time,
      // so there is NO balance change — just record the terminal state (+ optional txHash).
      const [updated] = await db
        .update(transactionsTable)
        .set({ status: "completed", ...(txHash ? { txHash: String(txHash) } : {}) })
        .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.type, "withdrawal"), reconcilable))
        .returning();
      if (!updated) {
        res.status(409).json({ error: "This withdrawal is no longer awaiting review." });
        return;
      }
      req.log.info({ txId, by: req.user!.userId }, "Reconcile: marked completed");
      res.json({ id: updated.id, status: updated.status });
      return;
    }

    if (resolution === "cancel_refund") {
      // Owner verified the payout was NOT sent and wants to cancel it: flip to failed and
      // refund the held balance ATOMICALLY. The guarded flip gates the refund, so concurrent
      // duplicates block on the row lock and can never double-refund.
      const refunded = await db.transaction(async (txn) => {
        const flipped = await txn
          .update(transactionsTable)
          .set({ status: "failed" })
          .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.type, "withdrawal"), reconcilable))
          .returning({ id: transactionsTable.id });
        if (flipped.length === 0) return false;
        await txn
          .update(usersTable)
          .set({ balance: sql`balance + ${parseFloat(tx.amount)}` })
          .where(eq(usersTable.id, tx.userId));
        return true;
      });
      if (!refunded) {
        res.status(409).json({ error: "This withdrawal is no longer awaiting review." });
        return;
      }
      req.log.info({ txId, by: req.user!.userId, amount: tx.amount }, "Reconcile: cancelled + refunded");
      res.json({ id: txId, status: "failed", amount: parseFloat(tx.amount) });
      return;
    }

    // resolution === "requeue": back to pending so the normal approve flow can retry the
    // payout. Only safe when the owner EXPLICITLY confirms Plisio did NOT send the funds —
    // a blind requeue after an ambiguous outcome is a double-pay hole.
    if (confirmedNotSent !== true) {
      res.status(400).json({
        error: "Requeue requires explicit confirmation that the payout was NOT sent (confirmedNotSent: true).",
      });
      return;
    }
    const [requeued] = await db
      .update(transactionsTable)
      .set({ status: "pending" })
      .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.type, "withdrawal"), reconcilable))
      .returning();
    if (!requeued) {
      res.status(409).json({ error: "This withdrawal is no longer awaiting review." });
      return;
    }
    req.log.info({ txId, by: req.user!.userId }, "Reconcile: requeued to pending");
    res.json({ id: requeued.id, status: requeued.status });
    return;
  } catch (err) {
    req.log.error({ err }, "Reconcile transaction error");
    res.status(500).json({ error: "Internal server error" });
  }
});


// ── OWNER BANK: GET /api/admin/bank/balances — live balances ──
// Strategy:
//   1. Fetch the Plisio /balances endpoint (returns all wallet balances at once — most reliable).
//   2. Also fetch individual /currencies/{coin} endpoints for rate_usd and allowed flag.
//   3. Query our own DB to see which coins have had real deposit activity.
// A coin is shown as "Active" (allowed=1) if:
//   • Plisio reports allowed=1, OR
//   • We have at least one completed deposit in that currency in the last 90 days, OR
//   • The coin is ETH or DOGE (always shown as Live — these are our primary currencies).
// Balance is taken from the Plisio /balances endpoint first (most accurate), then falls back
// to the individual /currencies/{coin} balance field.
// ETH and DOGE are ALWAYS shown as Live regardless of Plisio's allowed flag.
const ALWAYS_LIVE_COINS = new Set(["ETH", "DOGE"]);

adminRouter.get("/bank/balances", requireBankSession, async (req, res) => {
  const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? "";

  const ACCEPTED_COINS = [
    "BTC", "ETH", "LTC", "DOGE", "SOL", "BCH",
    "TRX", "XMR", "DASH", "TON", "USDT_TRX", "USDT_TON",
  ];

  try {
    // ── Query 1: our DB — which coins have seen real deposit activity (any status) ──
    // Use a broader window and include pending deposits so ETH/DOGE show active even
    // before a deposit is confirmed.
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const dbActivity = await db
      .select({
        currency: transactionsTable.currency,
        depositCount: sql<number>`count(*)`,
        totalUsd: sql<string>`coalesce(sum(${transactionsTable.amount}::numeric), 0)`,
      })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.type, "deposit"),
          // Include completed AND pending deposits so coins show Live as soon as a user
          // initiates a deposit, not only after it clears.
          sql`${transactionsTable.status} IN ('completed', 'pending')`,
          sql`${transactionsTable.createdAt} >= ${ninetyDaysAgo.toISOString()}`,
        )
      )
      .groupBy(transactionsTable.currency);

    const dbActiveCoins = new Set(dbActivity.map(r => (r.currency ?? "").toUpperCase()));
    const dbTotals: Record<string, { count: number; totalUsd: string }> = {};
    for (const row of dbActivity) {
      const c = (row.currency ?? "").toUpperCase();
      dbTotals[c] = { count: Number(row.depositCount), totalUsd: row.totalUsd };
    }

    // ── Query 2a: Plisio /balances endpoint — most reliable source for wallet balances ──
    // This returns all coin balances in one call.
    const plisioWalletBalances: Record<string, string> = {};
    if (PLISIO_KEY) {
      try {
        const params = new URLSearchParams({ api_key: PLISIO_KEY });
        const resp = await fetch(
          `https://api.plisio.net/api/v1/balances?${params.toString()}`,
          { signal: AbortSignal.timeout(12_000) },
        );
        const data = await resp.json() as {
          status?: string;
          data?: Record<string, { balance?: string; psys_cid?: string }>;
        };
        if (data.status === "success" && data.data) {
          // The /balances response uses Plisio's internal coin IDs as keys.
          // Map them to our uppercase coin names.
          const plisioToOurCoin: Record<string, string> = {
            BTC: "BTC", ETH: "ETH", LTC: "LTC", DOGE: "DOGE", SOL: "SOL",
            BCH: "BCH", TRX: "TRX", XMR: "XMR", DASH: "DASH", TON: "TON",
            USDT_TRX: "USDT_TRX", USDT_TON: "USDT_TON",
          };
          for (const [key, val] of Object.entries(data.data)) {
            const upperKey = key.toUpperCase();
            const ourCoin = plisioToOurCoin[upperKey] ?? upperKey;
            if (val?.balance && parseFloat(val.balance) > 0) {
              plisioWalletBalances[ourCoin] = val.balance;
            }
          }
        }
      } catch (balErr) {
        req.log.warn({ balErr }, "Plisio /balances endpoint failed — falling back to per-coin");
      }
    }

    // ── Query 2b: Plisio individual coin endpoints (for rate_usd + allowed flag) ──
    const plisioResults: Record<string, { balance: string; allowed: number; rate_usd?: string }> = {};
    if (PLISIO_KEY) {
      const fetches = await Promise.allSettled(
        ACCEPTED_COINS.map(async (coin) => {
          const params = new URLSearchParams({ api_key: PLISIO_KEY });
          const resp = await fetch(
            `https://api.plisio.net/api/v1/currencies/${coin}?${params.toString()}`,
            { signal: AbortSignal.timeout(10_000) },
          );
          const data = await resp.json() as {
            status?: string;
            data?: { balance?: string; allowed?: number; rate_usd?: string; price_usd?: string };
          };
          return { coin, data };
        })
      );
      for (const result of fetches) {
        if (result.status === "fulfilled") {
          const { coin, data } = result.value;
          if (data.status === "success" && data.data) {
            plisioResults[coin] = {
              balance: data.data.balance ?? "0",
              allowed: data.data.allowed ?? 0,
              rate_usd: data.data.rate_usd ?? data.data.price_usd ?? undefined,
            };
          }
        }
      }
    }

    // ── Merge: Plisio data + DB activity ──────────────────────────────────────
    const balances: Record<string, { balance: string; allowed: number; rate_usd?: string; depositCount?: number; totalUsd?: string }> = {};
    for (const coin of ACCEPTED_COINS) {
      const plisio = plisioResults[coin];
      const isDbActive = dbActiveCoins.has(coin);
      const isAlwaysLive = ALWAYS_LIVE_COINS.has(coin);
      // allowed=1 if:
      //   • ETH or DOGE (always live — our primary currencies), OR
      //   • Plisio reports allowed=1, OR
      //   • We have real deposit activity for this coin in the last 90 days
      const allowed = (isAlwaysLive || plisio?.allowed === 1 || isDbActive) ? 1 : 0;
      // Balance priority: /balances endpoint > /currencies/{coin} balance field
      const balance = plisioWalletBalances[coin] ?? plisio?.balance ?? "0";
      balances[coin] = {
        balance,
        allowed,
        rate_usd: plisio?.rate_usd,
        depositCount: dbTotals[coin]?.count ?? 0,
        totalUsd: dbTotals[coin]?.totalUsd ?? "0",
      };
    }

    res.json({ balances });
  } catch (err) {
    req.log.error({ err }, "Bank balances error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/transactions/:id/decline-deposit — mark pending deposit as declined, no credit
adminRouter.post("/transactions/:id/decline-deposit", requireAdmin, async (req, res) => {
  const txId = parseInt(req.params.id as string, 10);
  if (isNaN(txId)) { res.status(400).json({ error: "Invalid transaction ID" }); return; }
  try {
    const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, txId)).limit(1);
    if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }
    if (tx.type !== "deposit" || tx.status !== "pending") {
      res.status(400).json({ error: "Only pending deposits can be declined" });
      return;
    }
    await db.update(transactionsTable).set({ status: "declined" }).where(eq(transactionsTable.id, txId));
    req.log.info({ txId, userId: tx.userId }, "Admin declined deposit without credit");
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Decline deposit error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/bank/invoices — real invoice feed from our database (OWNER ONLY)
// Shows both deposits and withdrawals with all their real data.
// Reads directly from our Neon DB (no Plisio API call) so it always shows real invoices.
adminRouter.get("/bank/invoices", requireBankSession, async (req, res) => {
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Invoices are visible to the owner only." });
    return;
  }
  try {
    const pageNum = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "25"), 10)));
    const offset = (pageNum - 1) * limitNum;

    const invoices = await db
      .select({
        id: transactionsTable.id,
        txn_id: transactionsTable.plisioTrackId,
        order_id: transactionsTable.orderId,
        type: transactionsTable.type,
        status: transactionsTable.status,
        amount: transactionsTable.amount,
        currency: transactionsTable.currency,
        address: transactionsTable.address,
        txHash: transactionsTable.txHash,
        createdAt: transactionsTable.createdAt,
        updatedAt: transactionsTable.updatedAt,
        username: usersTable.username,
        userId: transactionsTable.userId,
      })
      .from(transactionsTable)
      .leftJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(limitNum)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(transactionsTable);

    res.json({ invoices, total: Number(total) });
  } catch (err) {
    req.log.error({ err }, "Bank invoices error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/bank/pending-withdrawals — our pending withdrawal queue
adminRouter.get("/bank/pending-withdrawals", requireBankSession, async (req, res) => {
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



// GET /api/admin/bank/settings — fanodgc only
adminRouter.get("/bank/settings", requireBankSession, async (req, res) => {
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
adminRouter.put("/bank/settings", requireBankSession, async (req, res) => {
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
// Two data sources merged for a comprehensive real-time fraud monitor:
//   Source A: fraudReviewsTable — saved AI decisions from auto-approval runs (history)
//   Source B: live scoring of ALL pending withdrawals (real-time queue)
adminRouter.get("/bank/fraud-alerts", requireBankSession, async (req, res) => {
  try {
    const settings = await getPlatformSettings();
    const sensitivityMultiplier = 0.5 + (settings.aiSensitivity / 100);

    // ── Source A: fraudReviewsTable — recent AI review records ───────────────
    // These represent decisions already made by the auto-processor (blocked, approved, etc.)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const fraudHistoryRows = await db
      .select({
        reviewId: fraudReviewsTable.id,
        withdrawalId: fraudReviewsTable.withdrawalId,
        userId: fraudReviewsTable.userId,
        amount: fraudReviewsTable.amount,
        score: fraudReviewsTable.score,
        flags: fraudReviewsTable.flags,
        decision: fraudReviewsTable.decision,
        metadata: fraudReviewsTable.metadata,
        createdAt: fraudReviewsTable.createdAt,
        username: usersTable.username,
        txStatus: transactionsTable.status,
        currency: transactionsTable.currency,
        address: transactionsTable.address,
      })
      .from(fraudReviewsTable)
      .leftJoin(usersTable, eq(fraudReviewsTable.userId, usersTable.id))
      .leftJoin(transactionsTable, eq(fraudReviewsTable.withdrawalId, transactionsTable.id))
      .where(sql`${fraudReviewsTable.createdAt} >= ${thirtyDaysAgo.toISOString()}`)
      .orderBy(desc(fraudReviewsTable.createdAt))
      .limit(100);

    // Map fraud history into alert shape — only show blocked/review decisions (not clean approvals)
    const historyAlerts = fraudHistoryRows
      .filter(r => r.decision === "blocked" || r.decision === "review" || (r.score ?? 0) >= 40)
      .map(r => ({
        id: r.withdrawalId ?? r.reviewId,
        reviewId: r.reviewId,
        userId: r.userId,
        username: r.username ?? `user_${r.userId}`,
        amount: String(r.amount ?? "0"),
        currency: r.currency ?? "?",
        type: "withdrawal" as const,
        status: r.txStatus ?? "unknown",
        address: r.address,
        riskScore: Number(r.score ?? 0),
        flags: (() => { try { return JSON.parse(r.flags ?? "[]") as string[]; } catch { return []; } })(),
        decision: r.decision,
        createdAt: r.createdAt,
        source: "history" as const,
      }));

    // ── Source B: Live scoring of ALL current pending withdrawals ────────────
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

    const liveAlerts = await Promise.all(
      pending.map(async (tx) => {
        const flags: string[] = [];
        let riskScore = 0;
        const amount = parseFloat(tx.amount ?? "0");

        if (amount > 500) {
          flags.push("large_amount");
          riskScore += amount > 2000 ? 35 : amount > 1000 ? 25 : 15;
        }

        const accountAgeDays = tx.userCreatedAt
          ? (Date.now() - new Date(tx.userCreatedAt).getTime()) / (1000 * 60 * 60 * 24)
          : 999;
        if (accountAgeDays < 7) {
          flags.push("new_account");
          riskScore += accountAgeDays < 1 ? 40 : accountAgeDays < 3 ? 30 : 20;
        }

        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [{ recentCount }] = await db
          .select({ recentCount: sql<number>`count(*)` })
          .from(transactionsTable)
          .where(and(
            eq(transactionsTable.userId, tx.userId),
            eq(transactionsTable.type, "withdrawal"),
            sql`created_at > ${oneDayAgo.toISOString()}`
          ));
        if (Number(recentCount) > 2) {
          flags.push("velocity");
          riskScore += Number(recentCount) > 5 ? 35 : Number(recentCount) > 3 ? 25 : 15;
        }

        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
        const [{ recentLoss }] = await db
          .select({ recentLoss: sql<number>`coalesce(sum(amount::numeric), 0)` })
          .from(betsTable)
          .where(and(
            eq(betsTable.userId, tx.userId),
            eq(betsTable.won, false),
            sql`created_at > ${sixHoursAgo.toISOString()}`
          ));
        if (Number(recentLoss) > 200) {
          flags.push("suspicious_pattern");
          riskScore += Number(recentLoss) > 1000 ? 30 : Number(recentLoss) > 500 ? 20 : 12;
        }

        if (amount > 100 && amount % 100 === 0) {
          flags.push("round_amount");
          riskScore += 8;
        }

        const balance = parseFloat(tx.userBalance ?? "0");
        if (balance > 0 && amount / balance > 0.9) {
          flags.push("full_balance_withdrawal");
          riskScore += 15;
        }

        if (tx.address) {
          const [{ addrCount }] = await db
            .select({ addrCount: sql<number>`count(distinct user_id)` })
            .from(transactionsTable)
            .where(and(
              eq(transactionsTable.address, tx.address),
              eq(transactionsTable.type, "withdrawal"),
            ));
          if (Number(addrCount) > 1) {
            flags.push("shared_withdrawal_address");
            riskScore += Number(addrCount) > 3 ? 50 : 35;
          }
        }

        const [latestDeposit] = await db
          .select({ createdAt: transactionsTable.createdAt })
          .from(transactionsTable)
          .where(and(
            eq(transactionsTable.userId, tx.userId),
            eq(transactionsTable.type, "deposit"),
            eq(transactionsTable.status, "completed"),
          ))
          .orderBy(desc(transactionsTable.createdAt))
          .limit(1);
        if (latestDeposit) {
          const minsAfterDeposit = (new Date(tx.createdAt).getTime() - new Date(latestDeposit.createdAt).getTime()) / 60000;
          if (minsAfterDeposit < 30 && minsAfterDeposit >= 0) {
            flags.push("immediate_withdrawal_after_deposit");
            riskScore += minsAfterDeposit < 5 ? 40 : 25;
          }
        }

        const [{ betCount }] = await db
          .select({ betCount: sql<number>`count(*)` })
          .from(betsTable)
          .where(eq(betsTable.userId, tx.userId));
        if (Number(betCount) === 0) {
          flags.push("no_play_withdrawal");
          riskScore += 30;
        }

        riskScore = Math.min(Math.round(riskScore * sensitivityMultiplier), 99);

        if (amount <= settings.autoApproveUnder && riskScore < 50) return null;

        if (amount > settings.requireManualOver && flags.length === 0) {
          flags.push("manual_review_threshold");
          riskScore = Math.max(riskScore, Math.round(20 * sensitivityMultiplier));
        }

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
          decision: "pending_review" as const,
          createdAt: tx.createdAt,
          source: "live" as const,
        };
      })
    );

    // ── Merge: deduplicate by transaction ID, live takes priority over history ──
    const seenTxIds = new Set<number>();
    const merged: typeof liveAlerts[number][] = [];

    // Add live alerts first (highest priority — these need action NOW)
    for (const alert of liveAlerts) {
      if (alert) {
        seenTxIds.add(alert.id);
        merged.push(alert);
      }
    }
    // Add history alerts that aren't already shown live
    for (const alert of historyAlerts) {
      if (!seenTxIds.has(alert.id)) {
        merged.push(alert as typeof liveAlerts[number]);
      }
    }

    // Sort: live pending first, then by risk score descending
    merged.sort((a, b) => {
      if (a?.source === "live" && b?.source !== "live") return -1;
      if (b?.source === "live" && a?.source !== "live") return 1;
      return (b?.riskScore ?? 0) - (a?.riskScore ?? 0);
    });

    res.json({ alerts: merged, stats: {
      livePending: liveAlerts.filter(Boolean).length,
      historyShown: historyAlerts.length,
      total: merged.length,
    }});
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
    const [recipient] = await db.select().from(usersTable).where(ilike(usersTable.username, toUsername)).limit(1);
    if (!recipient) { res.status(404).json({ error: "User not found: " + toUsername }); return; }
    if (recipient.id === sender.id) { res.status(400).json({ error: "Cannot tip yourself" }); return; }
    // The platform owner account is never externally mutable — block tips into it.
    if (isOwnerAccount(recipient)) { res.status(400).json({ error: "Cannot tip the house account" }); return; }

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

// POST /api/admin/transactions/:id/complete-deposit
// Owner-only: manually credit a stuck pending deposit to the user's balance.
// Use this when Plisio confirmed the deposit but the automatic IPN callback failed.
// Idempotent: safe to call twice — the second call is a no-op (already completed).
adminRouter.post("/transactions/:id/complete-deposit", requireBankSession, async (req, res) => {
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Only the platform owner can manually complete deposits." });
    return;
  }
  const txId = parseInt(req.params.id as string, 10);
  if (isNaN(txId)) { res.status(400).json({ error: "Invalid transaction ID" }); return; }
  try {
    const [tx] = await db
      .select()
      .from(transactionsTable)
      .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.type, "deposit")))
      .limit(1);
    if (!tx) { res.status(404).json({ error: "Deposit transaction not found" }); return; }
    if (tx.status === "completed") {
      res.json({ success: true, alreadyCompleted: true, creditAmount: parseFloat(tx.amount) });
      return;
    }
    if (tx.status !== "pending") {
      res.status(400).json({ error: `Cannot complete a deposit with status "${tx.status}"` });
      return;
    }
    const creditAmount = parseFloat(tx.amount);
    const WAGER_MULT = 1.0;
    await db.transaction(async (txn) => {
      // Guarded flip — idempotent against concurrent calls
      const flipped = await txn
        .update(transactionsTable)
        .set({ status: "completed" })
        .where(and(eq(transactionsTable.id, tx.id), eq(transactionsTable.status, "pending")))
        .returning({ id: transactionsTable.id });
      if (flipped.length === 0) return; // already completed by a concurrent call
      const [userAfter] = await txn.update(usersTable).set({
        balance: sql`balance + ${creditAmount}`,
        totalDeposited: sql`coalesce(total_deposited, 0) + ${creditAmount}`,
        wagerRequirement: sql`(coalesce(total_deposited, 0) + ${creditAmount}) * ${WAGER_MULT}`,
      }).where(eq(usersTable.id, tx.userId)).returning({ balance: usersTable.balance });
      if (userAfter) {
        const balanceAfter = parseFloat(userAfter.balance);
        await recordLedger(txn, {
          userId: tx.userId,
          amount: creditAmount,
          balanceBefore: balanceAfter - creditAmount,
          balanceAfter,
          reason: "admin_deposit_manual",
          referenceId: txId,
          referenceType: "transaction",
          note: `Manual deposit by admin #${req.user!.userId}`,
        });
      }
    });
    // Audit log
    logAudit({
      adminId: req.user!.userId,
      adminUsername: (await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1))[0]?.username ?? "admin",
      action: "manual_complete_deposit",
      targetType: "transaction",
      targetId: txId,
      oldValue: { status: "pending" },
      newValue: { status: "completed", creditAmount },
      ip: req.ip,
      note: `IPN bypass — manually credited $${creditAmount} to user #${tx.userId}`,
    }).catch(() => {});
    req.log.info({ txId, creditAmount, userId: tx.userId, by: req.user!.userId }, "Admin manually completed deposit — IPN bypass");
    res.json({ success: true, creditAmount });
  } catch (err) {
    req.log.error({ err }, "Admin complete-deposit error");
    res.status(500).json({ error: "Internal server error" });
  }
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

    // Withdrawals stuck in an ambiguous state (needs_review, or processing for >5 min) that
    // the owner must reconcile. Kept separate from the pending queue/counts on purpose.
    const needsReviewFilter = sql`(${transactionsTable.status} = 'needs_review' OR (${transactionsTable.status} = 'processing' AND ${transactionsTable.updatedAt} < now() - interval '5 minutes'))`;
    const [{ needsReviewWithdrawals }] = await db
      .select({ needsReviewWithdrawals: sql<number>`count(*)` })
      .from(transactionsTable)
      .where(and(eq(transactionsTable.type, "withdrawal"), needsReviewFilter));

    const [{ needsReviewAmount }] = await db
      .select({ needsReviewAmount: sql<number>`coalesce(sum(amount::numeric), 0)` })
      .from(transactionsTable)
      .where(and(eq(transactionsTable.type, "withdrawal"), needsReviewFilter));

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
      needsReviewWithdrawals: Number(needsReviewWithdrawals),
      needsReviewAmount: Number(needsReviewAmount),
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
  if (!(await callerIsOwner(req))) {
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

  // Prevent changing the owner account
  if (isOwnerAccount(target)) {
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
  if (!(await callerIsOwner(req))) {
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
adminRouter.get("/users/:id/bank-pin", requireAdmin, async (req, res) => {
  const [caller] = await db.select({ username: usersTable.username, role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!caller || caller.username !== "fanodgc") {
    res.status(403).json({ error: "Owner only" }); return;
  }
  const targetId = parseInt(String(req.params.id), 10);
  const [target] = await db.select({ id: usersTable.id, username: usersTable.username, role: usersTable.role, dgcBankPin: usersTable.dgcBankPin })
    .from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.role !== "admin") { res.status(400).json({ error: "User is not an admin" }); return; }
  res.json({ pin: target.dgcBankPin ?? null, username: target.username });
});

// POST /api/admin/users/:id/regenerate-pin — owner only, generates a fresh PIN
adminRouter.post("/users/:id/regenerate-pin", requireAdmin, async (req, res) => {
  const [caller] = await db.select({ username: usersTable.username })
    .from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!caller || caller.username !== "fanodgc") {
    res.status(403).json({ error: "Owner only" }); return;
  }
  const targetId = parseInt(String(req.params.id), 10);
  const [target] = await db.select({ id: usersTable.id, role: usersTable.role, username: usersTable.username })
    .from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.role !== "admin") { res.status(400).json({ error: "User is not an admin" }); return; }
  const newPin = await generateUniqueBankPin();
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

  // Issue a short-lived bank session token (valid 70 minutes — 1h10m)
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 70 * 60 * 1000).toISOString();

  // Store token temporarily in memory (simple approach — good enough for admin panel)
  if (!(global as any).__bankSessions) (global as any).__bankSessions = {};
  (global as any).__bankSessions[sessionToken] = { userId: user.id, expiresAt };

  res.json({ success: true, sessionToken, expiresAt });
});



// ── Tournament Admin Management ───────────────────────────────────────────────

// GET /api/admin/tournaments — list all with participant counts
adminRouter.get("/tournaments", async (req, res) => {
  try {
    const rows = await db.select().from(tournamentsTable).orderBy(desc(tournamentsTable.startAt)).limit(50);
    const now = new Date();
    const enriched = await Promise.all(rows.map(async (t) => {
      const [countRow] = await db.select({ n: count() }).from(tournamentEntriesTable).where(eq(tournamentEntriesTable.tournamentId, t.id));
      const liveStatus = now >= new Date(t.endAt) ? "ended" : now >= new Date(t.startAt) ? "active" : "upcoming";
      return {
        id: t.id, name: t.name, description: t.description,
        prize: parseFloat(t.prize), status: liveStatus,
        startAt: t.startAt.toISOString(), endAt: t.endAt.toISOString(),
        createdAt: t.createdAt.toISOString(), participants: Number(countRow?.n ?? 0),
      };
    }));
    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Admin list tournaments error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/tournaments/:id/leaderboard
adminRouter.get("/tournaments/:id/leaderboard", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, id)).limit(1);
    if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
    const entries = await db
      .select({ userId: tournamentEntriesTable.userId, score: tournamentEntriesTable.score, username: usersTable.username })
      .from(tournamentEntriesTable)
      .innerJoin(usersTable, eq(tournamentEntriesTable.userId, usersTable.id))
      .where(eq(tournamentEntriesTable.tournamentId, id))
      .orderBy(desc(sql`CAST(${tournamentEntriesTable.score} AS DECIMAL)`))
      .limit(50);
    res.json({
      tournament: { id: tournament.id, name: tournament.name, prize: parseFloat(tournament.prize), status: tournament.status, startAt: tournament.startAt.toISOString(), endAt: tournament.endAt.toISOString() },
      leaderboard: entries.map((e, i) => ({ rank: i + 1, userId: e.userId, username: e.username, score: parseFloat(e.score) })),
    });
  } catch (err) {
    req.log.error({ err }, "Admin tournament leaderboard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/tournaments — create a tournament
adminRouter.post("/tournaments", async (req, res) => {
  const { name, description, prize, startAt, endAt } = req.body as { name?: string; description?: string; prize?: number; startAt?: string; endAt?: string };
  if (!name?.trim() || !startAt || !endAt) { res.status(400).json({ error: "name, startAt and endAt are required" }); return; }
  if (isNaN(Date.parse(startAt)) || isNaN(Date.parse(endAt))) { res.status(400).json({ error: "Invalid date format" }); return; }
  if (new Date(endAt) <= new Date(startAt)) { res.status(400).json({ error: "endAt must be after startAt" }); return; }
  try {
    const [created] = await db.insert(tournamentsTable).values({
      name: name.trim(),
      description: description?.trim() || null,
      prize: String(prize ?? 0),
      status: new Date(startAt) > new Date() ? "upcoming" : "active",
      startAt: new Date(startAt),
      endAt: new Date(endAt),
    }).returning();
    req.log.info({ tournamentId: created.id, name: created.name }, "Admin created tournament");
    res.json({ success: true, tournament: { ...created, prize: parseFloat(created.prize) } });
  } catch (err) {
    req.log.error({ err }, "Admin create tournament error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/tournaments/:id — update tournament fields
adminRouter.patch("/tournaments/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { name, description, prize, startAt, endAt, status } = req.body as { name?: string; description?: string; prize?: number; startAt?: string; endAt?: string; status?: string };
  try {
    const updates: Record<string, unknown> = {};
    if (name) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (prize !== undefined) updates.prize = String(prize);
    if (startAt) updates.startAt = new Date(startAt);
    if (endAt) updates.endAt = new Date(endAt);
    if (status) updates.status = status;
    const [updated] = await db.update(tournamentsTable).set(updates).where(eq(tournamentsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Tournament not found" }); return; }
    req.log.info({ tournamentId: id }, "Admin updated tournament");
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Admin update tournament error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/admin/tournaments/:id
adminRouter.delete("/tournaments/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    await db.delete(tournamentEntriesTable).where(eq(tournamentEntriesTable.tournamentId, id));
    await db.delete(tournamentsTable).where(eq(tournamentsTable.id, id));
    req.log.info({ tournamentId: id }, "Admin deleted tournament");
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Admin delete tournament error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/tournaments/:id/end — force-end a tournament now
adminRouter.post("/tournaments/:id/end", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const [tournament] = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, id)).limit(1);
    if (!tournament) { res.status(404).json({ error: "Tournament not found" }); return; }
    await db.update(tournamentsTable).set({ status: "ended", endAt: new Date() }).where(eq(tournamentsTable.id, id));
    const [top] = await db
      .select({ userId: tournamentEntriesTable.userId, score: tournamentEntriesTable.score, username: usersTable.username })
      .from(tournamentEntriesTable)
      .innerJoin(usersTable, eq(tournamentEntriesTable.userId, usersTable.id))
      .where(eq(tournamentEntriesTable.tournamentId, id))
      .orderBy(desc(sql`CAST(${tournamentEntriesTable.score} AS DECIMAL)`))
      .limit(1);
    req.log.info({ tournamentId: id, winner: top?.username }, "Admin force-ended tournament");
    res.json({ success: true, winner: top ? { userId: top.userId, username: top.username, score: parseFloat(top.score) } : null });
  } catch (err) {
    req.log.error({ err }, "Admin end tournament error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/tournaments/:id/award — credit prize to a winner's balance
adminRouter.post("/tournaments/:id/award", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId, amount } = req.body as { userId?: number; amount?: number };
  if (!userId || !amount || amount <= 0) { res.status(400).json({ error: "userId and amount > 0 are required" }); return; }
  try {
    const [target] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!target) { res.status(404).json({ error: "User not found" }); return; }
    await db.update(usersTable).set({ balance: sql`balance + ${amount}` }).where(eq(usersTable.id, userId));
    await db.insert(transactionsTable).values({
      userId, type: "bet_win", amount: String(amount), currency: "USD", status: "completed",
      metadata: JSON.stringify({ source: "tournament_prize", tournamentId: id, awardedBy: req.user!.userId }),
    });
    req.log.info({ tournamentId: id, userId, amount, username: target.username }, "Admin awarded tournament prize");
    res.json({ success: true, username: target.username, amount });
  } catch (err) {
    req.log.error({ err }, "Admin award tournament error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin Chat ─────────────────────────────────────────────────────────────

// GET /api/admin/chat?since=<id>  — poll for messages
adminRouter.get("/chat", async (req, res) => {
  const since = parseInt(String(req.query.since ?? "0"), 10) || 0;
  try {
    const msgs = await db
      .select()
      .from(adminMessagesTable)
      .orderBy(desc(adminMessagesTable.createdAt))
      .limit(100);
    const ordered = msgs.reverse();
    const result = since > 0 ? ordered.filter((m) => m.id > since) : ordered;
    res.json({ messages: result });
  } catch (err) {
    req.log.error({ err }, "Admin chat get error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/chat  — send a message
adminRouter.post("/chat", async (req, res) => {
  const { message } = req.body as { message?: string };
  if (!message?.trim() || message.trim().length > 1000) {
    res.status(400).json({ error: "Message required (max 1000 chars)" });
    return;
  }
  try {
    const [caller] = await db
      .select({ username: usersTable.username, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);
    const [msg] = await db
      .insert(adminMessagesTable)
      .values({
        userId: req.user!.userId,
        username: caller?.username ?? "Unknown",
        role: caller?.role ?? "admin",
        message: message.trim(),
      })
      .returning();
    res.json({ message: msg });
  } catch (err) {
    req.log.error({ err }, "Admin chat post error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/admin/chat/:id  — owner only
adminRouter.delete("/chat/:id", async (req, res) => {
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Owner only" });
    return;
  }
  const msgId = parseInt(req.params.id, 10);
  if (isNaN(msgId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    await db.delete(adminMessagesTable).where(eq(adminMessagesTable.id, msgId));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Admin chat delete error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Messaging (DMs + Broadcasts to Creators/Admins) ─────────────────────────

// GET /api/admin/chat/recipients  — list all admins + creators for DM selection
adminRouter.get("/chat/recipients", async (req, res) => {
  try {
    const admins = await db
      .select({ id: usersTable.id, username: usersTable.username, role: usersTable.role })
      .from(usersTable)
      .where(or(eq(usersTable.role, "admin"), eq(usersTable.role, "owner")));

    const creators = await db
      .select({ id: usersTable.id, username: usersTable.username, accountType: usersTable.accountType })
      .from(usersTable)
      .where(eq(usersTable.accountType, "creator"));

    const myId = req.user!.userId;
    res.json({
      admins: admins.filter(a => a.id !== myId).map(a => ({ id: a.id, username: a.username, role: a.role })),
      creators: creators.map(c => ({ id: c.id, username: c.username, accountType: c.accountType })),
    });
  } catch (err) {
    req.log.error({ err }, "Admin chat recipients error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/messages  — send a DM or broadcast
adminRouter.post("/messages", async (req, res) => {
  const { recipientType, recipientId, message } = req.body as {
    recipientType?: string;
    recipientId?: number;
    message?: string;
  };

  const validTypes = ["direct", "broadcast_all", "broadcast_admins", "broadcast_creators"];
  if (!recipientType || !validTypes.includes(recipientType)) {
    res.status(400).json({ error: "recipientType must be one of: " + validTypes.join(", ") });
    return;
  }
  if (recipientType === "direct" && !recipientId) {
    res.status(400).json({ error: "recipientId required for direct messages" });
    return;
  }
  if (!message?.trim() || message.trim().length > 2000) {
    res.status(400).json({ error: "Message required (max 2000 chars)" });
    return;
  }

  try {
    const [caller] = await db
      .select({ username: usersTable.username, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId))
      .limit(1);

    const [msg] = await db
      .insert(creatorMessagesTable)
      .values({
        senderId: req.user!.userId,
        senderUsername: caller?.username ?? "Admin",
        senderRole: caller?.role ?? "admin",
        recipientType,
        recipientId: recipientType === "direct" ? recipientId : null,
        message: message.trim(),
      })
      .returning();

    res.json({ message: msg });
  } catch (err) {
    req.log.error({ err }, "Admin messages post error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/messages?recipientType=direct&recipientId=x  — fetch DM thread or broadcast history
adminRouter.get("/messages", async (req, res) => {
  const { recipientType, recipientId } = req.query as { recipientType?: string; recipientId?: string };
  const myId = req.user!.userId;

  try {
    let msgs: any[];

    if (recipientType === "direct" && recipientId) {
      const targetId = parseInt(recipientId, 10);
      msgs = await db
        .select()
        .from(creatorMessagesTable)
        .where(
          and(
            eq(creatorMessagesTable.recipientType, "direct"),
            or(
              and(eq(creatorMessagesTable.senderId, myId), eq(creatorMessagesTable.recipientId, targetId)),
              and(eq(creatorMessagesTable.senderId, targetId), eq(creatorMessagesTable.recipientId, myId)),
            ),
          ),
        )
        .orderBy(desc(creatorMessagesTable.createdAt))
        .limit(100);
    } else if (recipientType) {
      msgs = await db
        .select()
        .from(creatorMessagesTable)
        .where(eq(creatorMessagesTable.recipientType, recipientType))
        .orderBy(desc(creatorMessagesTable.createdAt))
        .limit(100);
    } else {
      msgs = await db
        .select()
        .from(creatorMessagesTable)
        .orderBy(desc(creatorMessagesTable.createdAt))
        .limit(100);
    }

    res.json({ messages: msgs.reverse() });
  } catch (err) {
    req.log.error({ err }, "Admin messages get error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/chat/unread  — unread count: group chat + DMs for this admin
adminRouter.get("/chat/unread", async (req, res) => {
  const lastGroupId = parseInt(String(req.query.lastGroupId ?? "0"), 10) || 0;
  const myId = req.user!.userId;

  try {
    const [{ groupUnread }] = await db
      .select({ groupUnread: count() })
      .from(adminMessagesTable)
      .where(
        and(
          gt(adminMessagesTable.id, lastGroupId),
          ne(adminMessagesTable.userId, myId),
        ),
      );

    const dmMessages = await db
      .select({ id: creatorMessagesTable.id })
      .from(creatorMessagesTable)
      .where(
        and(
          eq(creatorMessagesTable.recipientType, "direct"),
          eq(creatorMessagesTable.recipientId, myId),
        ),
      );

    const dmIds = dmMessages.map(m => m.id);
    let dmUnread = 0;
    if (dmIds.length > 0) {
      const reads = await db
        .select({ messageId: creatorMessageReadsTable.messageId })
        .from(creatorMessageReadsTable)
        .where(eq(creatorMessageReadsTable.userId, myId));
      const readSet = new Set(reads.map(r => r.messageId));
      dmUnread = dmIds.filter(id => !readSet.has(id)).length;
    }

    res.json({ groupUnread, dmUnread, total: groupUnread + dmUnread });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/messages/read  — mark DMs as read
adminRouter.post("/messages/read", async (req, res) => {
  const { messageIds } = req.body as { messageIds?: number[] };
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    res.status(400).json({ error: "messageIds array required" });
    return;
  }
  try {
    for (const messageId of messageIds) {
      await db.insert(creatorMessageReadsTable)
        .values({ messageId, userId: req.user!.userId })
        .onConflictDoNothing();
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/admin/messages/:id  — owner only
adminRouter.delete("/messages/:id", async (req, res) => {
  if (!(await callerIsOwner(req))) {
    res.status(403).json({ error: "Owner only" });
    return;
  }
  const msgId = parseInt(req.params.id, 10);
  if (isNaN(msgId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    await db.delete(creatorMessagesTable).where(eq(creatorMessagesTable.id, msgId));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});
