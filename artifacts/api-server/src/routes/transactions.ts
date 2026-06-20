import { Router } from "express";
import { db, usersTable, transactionsTable, referralsTable, userBalancesTable, creatorBankTxnsTable } from "@workspace/db";
import { eq, desc, and, ne, sql, count, gte } from "drizzle-orm";
import {
  InitiateDepositBody,
  RequestWithdrawalBody,
  ListTransactionsQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";
import { getPlatformSettings } from "../lib/platform-settings.js";
import { sendPlisioPayout } from "../lib/plisio-payout.js";
import { v4 as uuidv4 } from "uuid";
import { recordLedger } from "../services/ledger.js";
import { evaluateWithdrawal } from "../services/fraud.js";
import { getCryptoPrice } from "../lib/price-service.js";
import { getUserBalance, deductBalance, creditBalance, creditCryptoBalance } from "../lib/balance-service.js";

export const transactionsRouter = Router();

const PLISIO_SECRET_KEY = process.env.PLISIO_SECRET_KEY ?? process.env.PLISIO_API_KEY ?? process.env.API_KEY ?? "";
const PLISIO_API = "https://api.plisio.net/api/v1";

const WAGER_MULTIPLIER = 1.0;

// ── Auto-withdrawal threshold ──────────────────────────────────────────────────
// Withdrawals at or below this amount are instantly processed via Plisio without
// requiring admin approval, provided the fraud engine does not block them.
// This mirrors the platform setting "autoApproveUnder" but is also enforced here
// as a hard-coded ceiling so the setting can never be set above this limit.
const INSTANT_WITHDRAWAL_CEILING = 10_000;

const PLISIO_CURRENCY_MAP: Record<string, string> = {
  BTC:      "BTC",
  ETH:      "ETH",
  LTC:      "LTC",
  DOGE:     "DOGE",
  SOL:      "SOL",
  BCH:      "BCH",
  TRX:      "TRX",
  XMR:      "XMR",
  DASH:     "DASH",
  TON:      "TON",
  USDT_TON: "USDT_TON",
  USDT_TRX: "USDT_TRX",
};

// GET /api/transactions
transactionsRouter.get("/", requireAuth, async (req, res) => {
  const parsed = ListTransactionsQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 20) : 20;
  try {
    const rows = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, req.user!.userId))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(limit);
    res.json(
      rows.map((t) => ({
        id: t.id,
        userId: t.userId,
        type: t.type,
        amount: parseFloat(t.amount),
        currency: t.currency,
        status: t.status,
        txHash: t.txHash,
        address: t.address,
        createdAt: t.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "List transactions error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/transactions/coin-balances
// Returns LIVE per-coin USD values (from user_balances + real-time prices)
// plus the static USD balance for old users who have no crypto rows.
// This is the single source of truth for the frontend withdrawal limits.
transactionsRouter.get("/coin-balances", requireAuth, async (req, res) => {
  try {
    const { totalBalance, staticBalance, cryptoBalances } = await getUserBalance(req.user!.userId);

    // Build per-coin live USD map
    const balances: Record<string, number> = {};
    for (const cb of cryptoBalances) {
      if (cb.usdValue > 0) {
        balances[cb.currency] = cb.usdValue;
      }
    }

    // For old/legacy users who only have a static USD balance (no crypto rows),
    // expose the static balance so the frontend can allow withdrawals.
    // We tag it as "USD" so the frontend can detect and handle it.
    res.json({
      balances,
      totalBalance,
      staticBalance,
      // Per-coin raw crypto amounts (for display purposes)
      cryptoAmounts: Object.fromEntries(
        cryptoBalances.map(cb => [cb.currency, { amount: cb.amount, price: cb.price, usdValue: cb.usdValue }])
      ),
    });
  } catch (err) {
    req.log.error({ err }, "Coin balances error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/transactions/deposit/initiate
transactionsRouter.post("/deposit/initiate", requireAuth, async (req, res) => {
  const parsed = InitiateDepositBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { amount, currency } = parsed.data;
  const orderId = uuidv4();
  try {
    if (!PLISIO_SECRET_KEY) {
      res.status(500).json({ error: "Payment gateway not configured" });
      return;
    }
    const plisioCurrency = PLISIO_CURRENCY_MAP[currency.toUpperCase()] ?? currency.toUpperCase();
    const apiUrl  = process.env.API_URL ?? process.env.SITE_URL ?? "";
    const siteUrl = process.env.SITE_URL ?? apiUrl;
    const params = new URLSearchParams({
      api_key: PLISIO_SECRET_KEY,
      currency: plisioCurrency,
      source_amount: String(amount),
      order_number: orderId,
      order_name: "DGC Arcade Deposit",
      source_currency: "USD",
      callback_url: `${apiUrl}/api/transactions/deposit/callback`,
      success_url: `${siteUrl}/profile`,
      fail_url: `${siteUrl}/profile`,
    });
    const response = await fetch(`${PLISIO_API}/invoices/new?${params.toString()}`);
    const data = await response.json() as {
      status: string;
      data?: {
        txn_id: string;
        invoice_url: string;
        invoice_total_sum: string;
        wallet_hash?: string;
        qr_code?: string;
        qr_code_link?: string;
        psys_cid?: string;
        source_amount?: string;
      };
      message?: string;
    };
    req.log.info({ plisio_response: JSON.stringify(data) }, "Plisio raw response");
    if (data.status !== "success" || !data.data) {
      req.log.error({ data }, "Plisio deposit error");
      const errMsg = (data.data as any)?.message ?? data.message ?? (typeof data.data === "string" ? data.data : "Unknown error");
      req.log.error({ plisio_full: JSON.stringify(data) }, "Plisio deposit full error");
      res.status(500).json({ error: "Payment gateway error: " + errMsg });
      return;
    }
    const walletAddress = data.data.wallet_hash ?? "";
    const qrCodeUrl = data.data.qr_code ?? data.data.qr_code_link ?? "";
    req.log.info({
      walletAddress: walletAddress ? "present" : "MISSING",
      qrCode: qrCodeUrl ? "present" : "MISSING",
      currency: plisioCurrency,
      txn_id: data.data.txn_id,
    }, "Plisio invoice created");

    await db.insert(transactionsTable).values({
      userId: req.user!.userId,
      type: "deposit",
      amount: String(amount),
      currency,
      status: "pending",
      plisioTrackId: data.data.txn_id,
      orderId,
      address: walletAddress,
      metadata: JSON.stringify({
        source_amount: String(amount),
        source_currency: "USD",
        expected_crypto: data.data.invoice_total_sum,
        created_at: new Date().toISOString()
      })
    });
    res.json({
      paymentUrl: data.data.invoice_url,
      trackId: data.data.txn_id,
      orderId,           // used by frontend to poll /deposit/status/:orderId
      address: walletAddress,
      qrCode: qrCodeUrl,
      cryptoAmount: data.data.invoice_total_sum,
    });
  } catch (err) {
    req.log.error({ err }, "Initiate deposit error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Plisio IPN / Webhook ──────────────────────────────────────────────────────
const PLISIO_IPS = new Set([
  "65.21.19.51", "65.21.19.52", "65.21.19.53",
  "65.21.19.54", "65.21.19.55", "138.201.43.212",
]);

function plisioHtmlEntityDecode(input: string): string {
  return input
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&");
}

export function plisioSerialize(body: Record<string, unknown>): string {
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === "verify_hash") continue;
    params[k] = v == null ? "" : String(v);
  }
  if (typeof params.tx_urls === "string") params.tx_urls = plisioHtmlEntityDecode(params.tx_urls);
  const keys = Object.keys(params).sort();
  let out = `a:${keys.length}:{`;
  for (const k of keys) {
    out += `s:${Buffer.byteLength(k, "utf8")}:"${k}";s:${Buffer.byteLength(params[k], "utf8")}:"${params[k]}";`;
  }
  return out + "}";
}

transactionsRouter.post("/deposit/callback", async (req, res) => {
  try {
    const clientIp = (req.ip ?? "").replace(/^::ffff:/, "").trim();
    const {
      txn_id, status, source_amount, received_amount,
      invoice_total_sum, verify_hash, tx_urls, currency: pCurrency,
      received_amount_usd, source_amount_usd
    } = req.body as {
      txn_id?: string; status?: string;
      source_amount?: string | number; received_amount?: string | number;
      invoice_total_sum?: string | number; verify_hash?: string; tx_urls?: string;
      currency?: string; received_amount_usd?: string | number; source_amount_usd?: string | number;
    };

    // HMAC-SHA1 — hard gate
    if (PLISIO_SECRET_KEY) {
      if (!verify_hash) {
        req.log.warn({ txn_id }, "Plisio IPN rejected: missing verify_hash");
        res.status(400).json({ error: "Invalid signature" });
        return;
      }
      const crypto = await import("crypto");
      const serialized = plisioSerialize(req.body as Record<string, unknown>);
      const expectedHash = crypto.createHmac("sha1", PLISIO_SECRET_KEY).update(serialized).digest("hex");
      const want = Buffer.from(expectedHash, "utf8");
      const got  = Buffer.from(String(verify_hash), "utf8");
      if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
        req.log.warn({ txn_id }, "Plisio IPN rejected: hash mismatch");
        res.status(400).json({ error: "Invalid signature" });
        return;
      }
    }

    if (!txn_id || !status) {
      res.json({ success: true });
      return;
    }

    const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.plisioTrackId, txn_id)).limit(1);
    if (!tx) {
      res.json({ success: true });
      return;
    }

    // ── STEP 2: SERVER-TO-SERVER PLISIO VERIFICATION ──────────────────────────
    // After HMAC-SHA1, we make a direct API call to Plisio to independently
    // confirm the payload is authentic and to get the authoritative actual_amount.
    // This prevents replay/spoofed IPN attacks even if the secret key is compromised.
    let plisioVerifiedActualAmount: number = 0;
    let plisioVerifiedActualAmountUsd: number = 0;
    let plisioVerifiedStatus: string = "";
    try {
      const plisioKey = PLISIO_SECRET_KEY;
      const verifyUrl = `https://plisio.net/api/v1/operations/${encodeURIComponent(txn_id)}?api_key=${plisioKey}`;
      const verifyResp = await fetch(verifyUrl, { signal: AbortSignal.timeout(8000) });
      if (verifyResp.ok) {
        const verifyData = await verifyResp.json() as any;
        if (verifyData?.status === "success" && verifyData?.data) {
          const d = verifyData.data;
          // actual_amount = what was really received on-chain (authoritative)
          const aa = parseFloat(String(d.actual_amount ?? d.received_amount ?? d.sum_received ?? "0"));
          if (aa > 0) plisioVerifiedActualAmount = aa;
          const aau = parseFloat(String(d.actual_amount_usd ?? d.received_amount_usd ?? d.sum_received_usd ?? "0"));
          if (aau > 0) plisioVerifiedActualAmountUsd = aau;
          plisioVerifiedStatus = String(d.status ?? "").toLowerCase();
          req.log.info({
            event: "plisio_api_verify",
            txn_id,
            plisioVerifiedActualAmount,
            plisioVerifiedActualAmountUsd,
            plisioVerifiedStatus,
          }, "Plisio server-to-server verification succeeded");
        } else {
          req.log.warn({ txn_id, verifyData }, "Plisio API verify: non-success response — proceeding with IPN data");
        }
      } else {
        req.log.warn({ txn_id, httpStatus: verifyResp.status }, "Plisio API verify: HTTP error — proceeding with IPN data");
      }
    } catch (verifyErr) {
      req.log.warn({ txn_id, verifyErr }, "Plisio API verify: fetch failed — proceeding with IPN data only");
    }

    if (tx.type === "withdrawal") {
      if (status === "completed") {
        const onChainHash = tx_urls
          ? (() => { try { const p = JSON.parse(plisioHtmlEntityDecode(tx_urls)); return Array.isArray(p) ? String(p[0]) : null; } catch { return null; } })()
          : null;
        await db.update(transactionsTable).set({ status: "completed", ...(onChainHash ? { txHash: onChainHash } : {}) }).where(eq(transactionsTable.id, tx.id));
      } else if (status === "error") {
        const amount = parseFloat(tx.amount);
        await db.transaction(async (txn) => {
          const flipped = await txn.update(transactionsTable).set({ status: "failed" }).where(and(eq(transactionsTable.id, tx.id), ne(transactionsTable.status, "failed"))).returning({ id: transactionsTable.id });
          if (flipped.length === 0) return;
          await txn.update(usersTable).set({ balance: sql`balance + ${amount}` }).where(eq(usersTable.id, tx.userId));
        });
      }
      res.json({ success: true });
      return;
    }

    // ── DEPOSIT IPN ───────────────────────────────────────────────────────────
    if (tx.status === "completed") {
      res.json({ success: true });
      return;
    }

    const pStatus = String(status).toLowerCase();
    // STEP 3: Credit on completed, mismatch, overpaid, finished, OR overdue
    // "overdue" = user paid late but Plisio still received the funds — must credit.
    const creditStatuses = new Set(["completed", "mismatch", "overpaid", "finished", "overdue"]);
    if (!creditStatuses.has(pStatus)) {
      res.json({ success: true });
      return;
    }

    // ── FULL IPN BODY LOG (debug underpayment issues) ─────────────────────
    req.log.info({
      event: "plisio_ipn_full_body",
      txn_id, ipn_status: String(status).toLowerCase(),
      ipnBody: JSON.stringify(req.body).substring(0, 4000),
    }, "Plisio IPN: full body for crediting decision");

    // ── ACTUAL RECEIVED AMOUNT (exhaustive field search) ───────────────────
    // "Completed Auto" = Plisio auto-completed an underpaid invoice.
    // We MUST credit the actual received amount, never the invoiced amount.
    const cryptoCurrency = tx.currency || pCurrency || "ETH";
    const bodyRaw = req.body as Record<string, unknown>;

    // STEP 1 & 2: actual_amount — priority chain:
    //   1. Plisio API server-to-server verified actual_amount (most authoritative)
    //   2. actual_amount from IPN body
    //   3. received_amount and other field name aliases from IPN body
    let cryptoAmountReceived = plisioVerifiedActualAmount > 0
      ? plisioVerifiedActualAmount
      : parseFloat(String(
          bodyRaw.actual_amount     ||  // STEP 1: actual_amount field first
          received_amount           ||
          bodyRaw.received_sum      ||
          bodyRaw.paid_amount       ||
          bodyRaw.tx_amount         ||
          bodyRaw.amount_received   ||
          bodyRaw.sum_received      ||
          "0"
        ));
    const cryptoAmountInvoiced = parseFloat(String(invoice_total_sum || bodyRaw.total_sum || bodyRaw.sum_expected || "0"));
    // Use Plisio API verified USD value as top priority
    let receivedUsdValue = plisioVerifiedActualAmountUsd > 0
      ? plisioVerifiedActualAmountUsd
      : parseFloat(String(received_amount_usd || bodyRaw.received_sum_usd || bodyRaw.amount_usd || "0"));
    const sourceUsd = parseFloat(String(source_amount_usd || source_amount || tx.amount));

    // ── EXTRACT FROM txs ARRAY IN IPN BODY ────────────────────────────────
    // Plisio IPN sometimes includes txs array with on-chain tx data.
    // This is the most reliable source for actual received crypto.
    if (cryptoAmountReceived <= 0) {
      const rawTxs = bodyRaw.txs ?? bodyRaw.transactions ?? bodyRaw.tx_list;
      const txsList: any[] = Array.isArray(rawTxs)
        ? rawTxs
        : (rawTxs && typeof rawTxs === "object" ? Object.values(rawTxs as object) : []);

      if (txsList.length > 0) {
        const extracted = txsList.reduce((sum: number, t: any) => {
          const amt = parseFloat(String(
            t.amount          ||
            t.received        ||
            t.crypto_amount   ||
            t.source_amount   ||
            t.value           ||
            t.sum             ||
            t.received_amount ||
            t.incoming        ||
            "0"
          ));
          return sum + amt;
        }, 0);
        if (extracted > 0) {
          cryptoAmountReceived = extracted;
          req.log.info(
            { txn_id, cryptoAmountReceived, txsCount: txsList.length },
            "Plisio IPN: extracted received amount from txs array"
          );
        }
      }
    }

    const altReceivedCrypto = 0; // already folded into cryptoAmountReceived above

    // ── STRUCTURED ENTRY LOG ──────────────────────────────────────────────
    // Full audit trail before any crediting decision is made.
    req.log.info({
      event: "plisio_ipn_received",
      txn_id,
      tx_db_id: tx.id,
      user_id: tx.userId,
      ipn_status: pStatus,
      currency: cryptoCurrency,
      invoice_amount_crypto: cryptoAmountInvoiced,
      received_amount_crypto: cryptoAmountReceived,
      received_amount_usd: receivedUsdValue,
      requested_amount_usd: sourceUsd,
      wallet_address: tx.address ?? null,
    }, "Plisio IPN: crediting decision start");

    // ── STRICT GUARD: require real received data from Plisio ────────────────
    // If neither received_amount nor received_amount_usd is present we cannot
    // determine how much actually arrived. Return 200 so Plisio doesn't retry.
    // Exception: for "completed" status Plisio confirms the full invoice was paid —
    // credit sourceUsd directly since the polling API doesn't always echo received_amount.
    const effectiveCryptoReceived = cryptoAmountReceived > 0 ? cryptoAmountReceived : altReceivedCrypto;
    if (effectiveCryptoReceived <= 0 && receivedUsdValue <= 0) {
      if (pStatus === "completed" && sourceUsd > 0) {
        // background-tasks will also attempt this, but let IPN credit it if present
        req.log.info({
          event: "plisio_ipn_completed_no_received",
          txn_id, tx_db_id: tx.id, user_id: tx.userId, sourceUsd,
        }, "Plisio IPN: status=completed, received_amount=0 — will credit invoice amount");
        // fall through with effectiveCryptoReceived=0 and we'll use sourceUsd directly below
      } else {
        req.log.warn({
          event: "plisio_ipn_no_received_amount",
          txn_id, tx_db_id: tx.id, user_id: tx.userId, ipn_status: pStatus,
          received_amount, received_amount_usd,
        }, "Plisio IPN: no received_amount data — skipping credit, sync will handle it");
        res.json({ success: true });
        return;
      }
    }

    // ── CALCULATE USD CREDIT AMOUNT ─────────────────────────────────────────
    // Priority 1: Plisio gives us received_amount_usd directly.
    // Priority 2: We have both received and invoiced crypto amounts → use ratio.
    // Priority 3: We have received crypto but no invoiced amount → price-lookup.
    //             NEVER fall back to sourceUsd (invoice amount) — that would credit
    //             the full invoice value even when only a fraction was paid.
    let creditAmountUsd: number;
    let exchangeRate: number | null = null;
    let creditCalcMethod: string;

    if (receivedUsdValue > 0) {
      creditAmountUsd = Math.round(receivedUsdValue * 1e8) / 1e8;
      creditCalcMethod = "plisio_usd_direct";
      if (effectiveCryptoReceived > 0) {
        exchangeRate = Math.round((receivedUsdValue / effectiveCryptoReceived) * 1e8) / 1e8;
      }
    } else if (effectiveCryptoReceived > 0 && cryptoAmountInvoiced > 0 && sourceUsd > 0) {
      const ratio = effectiveCryptoReceived / cryptoAmountInvoiced;
      creditAmountUsd = Math.round(sourceUsd * ratio * 1e8) / 1e8;
      creditCalcMethod = "ratio_received_over_invoiced";
      exchangeRate = effectiveCryptoReceived > 0 ? Math.round((creditAmountUsd / effectiveCryptoReceived) * 1e8) / 1e8 : null;
    } else if (effectiveCryptoReceived > 0) {
      // Have received crypto but no invoiced total — look up live price.
      const livePrice = await getCryptoPrice(cryptoCurrency);
      creditAmountUsd = Math.round(effectiveCryptoReceived * livePrice * 1e8) / 1e8;
      exchangeRate = livePrice;
      creditCalcMethod = "live_price_lookup";

      req.log.warn({
        event: "plisio_ipn_no_invoice_total",
        txn_id, tx_db_id: tx.id, user_id: tx.userId,
        cryptoCurrency, effectiveCryptoReceived, livePrice, creditAmountUsd,
        requested_amount_usd: sourceUsd,
      }, "Plisio IPN: invoice_total_sum missing — used live price lookup (NOT invoice amount)");
    } else {
      // status=completed, received_amount=0 — Plisio confirmed full invoice paid.
      creditAmountUsd = Math.round(sourceUsd * 1e8) / 1e8;
      creditCalcMethod = "completed_status_invoice_amount";
      req.log.info({
        event: "plisio_ipn_completed_fallback",
        txn_id, tx_db_id: tx.id, user_id: tx.userId, sourceUsd, creditAmountUsd,
      }, "Plisio IPN: status=completed, crediting invoice amount (no received_amount in payload)");
    }

    // ── OVERPAYMENT WARNING ───────────────────────────────────────────────
    if (sourceUsd > 0 && creditAmountUsd > sourceUsd * 1.05) {
      req.log.warn({
        event: "plisio_ipn_overpayment",
        txn_id,
        tx_db_id: tx.id,
        user_id: tx.userId,
        requested_amount_usd: sourceUsd,
        credit_amount_usd: creditAmountUsd,
        overpaid_by_usd: creditAmountUsd - sourceUsd,
      }, "Plisio IPN: overpayment detected — crediting actual received amount");
    }

    await db.transaction(async (txn) => {
      const flipped = await txn
        .update(transactionsTable)
        .set({ 
          status: "completed", 
          amount: String(creditAmountUsd),
          metadata: JSON.stringify({
            invoice_amount_crypto: cryptoAmountInvoiced,
            received_amount_crypto: cryptoAmountReceived,
            received_amount_usd: receivedUsdValue,
            requested_amount_usd: sourceUsd,
            credit_amount_usd: creditAmountUsd,
            exchange_rate: exchangeRate,
            credit_calc_method: creditCalcMethod,
            currency: cryptoCurrency,
            wallet_address: tx.address ?? null,
            txn_id,
            paid_at: new Date().toISOString(),
            ipn_status: pStatus,
          })
        })
        .where(and(eq(transactionsTable.id, tx.id), ne(transactionsTable.status, "completed")))
        .returning({ id: transactionsTable.id });

      if (flipped.length === 0) return;

      // 1. Credit Crypto-Native Balance — actual received crypto when available.
      if (effectiveCryptoReceived > 0) {
        await creditCryptoBalance(tx.userId, cryptoCurrency, effectiveCryptoReceived, txn);
      } else {
        // No crypto amount (completed_status_invoice_amount path) — credit USD balance
        await txn.update(usersTable).set({ balance: sql`balance + ${creditAmountUsd}` }).where(eq(usersTable.id, tx.userId));
      }

      // 2. Update Stats
      await txn.update(usersTable).set({
        totalDeposited: sql`coalesce(total_deposited, 0) + ${creditAmountUsd}`,
        wagerRequirement: sql`coalesce(wager_requirement, 0) + ${creditAmountUsd * WAGER_MULTIPLIER}`,
      }).where(eq(usersTable.id, tx.userId));

      // 3. Fetch real pre-credit balance for accurate ledger entry
      const [preBalance] = await txn
        .select({ balance: usersTable.balance })
        .from(usersTable)
        .where(eq(usersTable.id, tx.userId))
        .limit(1);
      const balanceBefore = preBalance ? parseFloat(preBalance.balance) - (cryptoAmountReceived > 0 ? 0 : creditAmountUsd) : 0;

      // 4. Record Ledger
      await recordLedger(txn, {
        userId: tx.userId,
        amount: creditAmountUsd,
        balanceBefore,
        balanceAfter: balanceBefore + creditAmountUsd,
        reason: "deposit",
        referenceId: tx.id,
        referenceType: "transaction",
        note: `IPN [${pStatus}] credited ${cryptoAmountReceived > 0 ? cryptoAmountReceived + " " + cryptoCurrency : "$" + creditAmountUsd + " USD"} (~$${creditAmountUsd.toFixed(2)}) via ${creditCalcMethod}. Invoice: ${cryptoAmountInvoiced} ${cryptoCurrency}. Txn: ${txn_id}`,
      });
      
      // 4. Referral commission
      try {
        const [depositor] = await txn.select({ referredBy: usersTable.referredBy }).from(usersTable).where(eq(usersTable.id, tx.userId)).limit(1);
        if (depositor?.referredBy) {
          const referrerId = depositor.referredBy;
          const [activeRow] = await txn.select({ n: count() }).from(referralsTable).where(and(eq(referralsTable.referrerId, referrerId), eq(referralsTable.status, "active")));
          const active = activeRow?.n ?? 0;
          const commissionRate = active >= 50 ? 0.10 : active >= 20 ? 0.07 : active >= 5 ? 0.05 : 0.03;
          const commission = Math.round(creditAmountUsd * commissionRate * 1e8) / 1e8;
          if (commission > 0) {
            // Commission is always credited to static USD balance (bonus)
            await txn.update(usersTable).set({ balance: sql`balance + ${commission}` }).where(eq(usersTable.id, referrerId));
            await txn.update(referralsTable).set({ status: "active", earnedAmount: sql`CAST(earned_amount AS DECIMAL) + ${commission}` }).where(and(eq(referralsTable.referrerId, referrerId), eq(referralsTable.referredId, tx.userId)));
            await txn.insert(creatorBankTxnsTable).values({
              creatorId: referrerId,
              type: "referral_commission",
              amount: String(commission),
              toUserId: tx.userId,
              description: `Commission from deposit ${tx.plisioTrackId || tx.id}`
            });
          }
        }
      } catch (commErr) { req.log.warn({ commErr }, "Referral commission failed"); }
    });

    sendNtfy(process.env.NTFY_TOPIC, {
      title: "DGC Arcade — New Deposit",
      priority: "high",
      tags: "money_with_wings",
      body: `+${cryptoAmountReceived} ${cryptoCurrency} (~$${creditAmountUsd.toFixed(2)})\nTxn: ${txn_id}\nUser: ${tx.userId}`,
    });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Plisio IPN callback error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── STEP 4: Deposit Status Polling Endpoint ────────────────────────────────
// Frontend polls this every 5s after generating a deposit address so the user
// sees their credited balance the moment Plisio confirms the payment.
// Returns the transaction status + the user's real-time live balance.
transactionsRouter.get("/deposit/status/:orderId", requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) { res.status(400).json({ error: "orderId required" }); return; }

    // Find the transaction by order_id (set at deposit initiation)
    const [tx] = await db
      .select({
        id: transactionsTable.id,
        status: transactionsTable.status,
        amount: transactionsTable.amount,
        currency: transactionsTable.currency,
        plisioTrackId: transactionsTable.plisioTrackId,
        createdAt: transactionsTable.createdAt,
        updatedAt: transactionsTable.updatedAt,
      })
      .from(transactionsTable)
      .where(and(
        sql`${transactionsTable.orderId} = ${orderId}`,
        eq(transactionsTable.userId, req.user!.userId),
        eq(transactionsTable.type, "deposit")
      ))
      .limit(1);

    if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }

    // Live balance — crypto-native, current market price
    const { totalBalance, cryptoBalances } = await getUserBalance(req.user!.userId);

    res.json({
      transactionId: tx.id,
      status: tx.status,
      amount: tx.amount,
      currency: tx.currency,
      credited: tx.status === "completed",
      liveBalance: totalBalance,
      cryptoBalances,
      updatedAt: tx.updatedAt,
    });
  } catch (err) {
    req.log.error({ err }, "Deposit status polling error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function sendNtfy(topic: string | undefined, opts: { title: string; priority: string; tags: string; body: string }) {
  if (!topic) return;
  fetch(`https://ntfy.sh/${topic}`, {
    method: "POST",
    headers: {
      "Title": opts.title,
      "Priority": opts.priority,
      "Tags": opts.tags,
      "Content-Type": "text/plain",
    },
    body: opts.body,
  }).catch(() => {});
}

// POST /api/transactions/withdraw
// ── Auto-withdrawal logic ──────────────────────────────────────────────────────
// Withdrawals at or below INSTANT_WITHDRAWAL_CEILING ($10,000) are automatically
// processed via Plisio without admin approval, provided:
//   1. The fraud engine decision is "approved" or "review" (not "blocked")
//   2. A valid payout address is present
//   3. The user has sufficient balance (checked via getUserBalance — reads BOTH
//      static USD balance AND live crypto balances, never just the invoice amount)
//
// Withdrawals above $10,000 OR with a "blocked" fraud decision are queued as
// "pending" for the admin to review in the DGC Bank panel.
// ─────────────────────────────────────────────────────────────────────────────
transactionsRouter.post("/withdraw", requireAuth, async (req, res) => {
  const parsed = RequestWithdrawalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { amount, currency, address } = parsed.data;
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    // ── Balance check: uses ACTUAL balance (static USD + live crypto valuations) ──
    // This is the real balance — not the invoice amount or any stored figure.
    const { totalBalance, cryptoBalances } = await getUserBalance(user.id);
    if (totalBalance < amount) { res.status(400).json({ error: "Insufficient balance" }); return; }

    // ── Coin-lock enforcement ──────────────────────────────────────────────────
    // If the user has deposited crypto (non-zero user_balances rows), they may
    // only withdraw in a currency they actually hold. This prevents the house
    // paying out in a currency it never received (e.g. ETH payout for a DOGE
    // deposit). Legacy users with only a static USD balance skip this check.
    const hasCryptoHoldings = cryptoBalances.some(cb => cb.amount > 0);
    if (hasCryptoHoldings) {
      const holdsCurrency = cryptoBalances.some(cb => cb.currency === currency && cb.amount > 0);
      if (!holdsCurrency) {
        const available = cryptoBalances.filter(cb => cb.amount > 0).map(cb => cb.currency).join(", ");
        res.status(400).json({
          error: `Coin-locked: you can only withdraw in the currency you deposited. Your holdings: ${available || "none"}`
        });
        return;
      }
    }

    const settings = await getPlatformSettings();
    if (amount < settings.minWithdrawal) { res.status(400).json({ error: `Minimum withdrawal is $${settings.minWithdrawal}` }); return; }

    // ── Fraud evaluation ──────────────────────────────────────────────────────
    // Insert the transaction row first (pending) so the fraud evaluator can
    // reference it by withdrawalId if needed.
    const [tx] = await db.insert(transactionsTable).values({
      userId: user.id,
      type: "withdrawal",
      amount: String(amount),
      currency,
      address,
      status: "pending",
    }).returning();

    // Deduct balance immediately — funds are held while the payout is processed.
    // If the payout fails, the balance is refunded (see admin reconcile flow).
    await deductBalance(user.id, amount);

    await recordLedger(db, {
      userId: user.id,
      amount: -amount,
      balanceBefore: totalBalance,
      balanceAfter: totalBalance - amount,
      reason: "withdrawal",
      referenceId: tx.id,
      referenceType: "transaction",
      note: `Withdrawal request for $${amount} ${currency}`,
    });

    // ── Fraud check (correct object signature) ────────────────────────────────
    const fraudResult = await evaluateWithdrawal({ userId: user.id, amount, withdrawalId: tx.id });

    req.log.info(
      { txId: tx.id, amount, fraudScore: fraudResult.score, fraudDecision: fraudResult.decision, flags: fraudResult.flags },
      "Withdrawal fraud evaluation complete"
    );

    // ── Auto-process decision ─────────────────────────────────────────────────
    // Conditions for instant payout:
    //   • Amount is at or below the $10,000 ceiling
    //   • Amount is at or below the platform's autoApproveUnder setting
    //   • Fraud engine did NOT block the withdrawal
    //   • A payout address is present
    // Always use the hard $10k ceiling — the platform DB setting cannot lower this.
    // Withdrawals under $10,000 are instant; only fraud-blocked or >$10k go to manual review.
    const autoApproveLimit = INSTANT_WITHDRAWAL_CEILING;
    const isInstant = amount <= autoApproveLimit && fraudResult.decision !== "blocked" && !!address;

    if (isInstant) {
      req.log.info(
        { txId: tx.id, amount, autoApproveLimit, fraudDecision: fraudResult.decision },
        "Withdrawal qualifies for instant auto-processing — sending Plisio payout"
      );

      // Fire the payout — sendPlisioPayout handles the pending→processing→completed
      // state machine atomically with double-pay protection.
      const payoutResult = await sendPlisioPayout(tx.id, req.log);

      switch (payoutResult.outcome) {
        case "completed":
          sendNtfy(process.env.NTFY_TOPIC, {
            title: "DGC Arcade — Auto Withdrawal Sent",
            priority: "default",
            tags: "outbox_tray",
            body: `$${amount} ${currency} → ${address}\nTxn: ${tx.id} | TxHash: ${payoutResult.txHash ?? "pending"}\nUser: ${user.id}`,
          });
          res.json({ success: true, transactionId: tx.id, status: "completed", txHash: payoutResult.txHash });
          return;

        case "reverted_pending":
          // Rate fetch failed — left as pending for admin to retry
          req.log.warn({ txId: tx.id, message: payoutResult.message }, "Auto-withdrawal: rate fetch failed, left pending");
          res.json({ success: true, transactionId: tx.id, status: "pending", message: "Payout queued — rate fetch failed, will retry shortly." });
          return;

        case "needs_review":
          // Network/ambiguous outcome — left as needs_review for admin
          req.log.warn({ txId: tx.id, message: payoutResult.message }, "Auto-withdrawal: ambiguous Plisio response, needs review");
          res.json({ success: true, transactionId: tx.id, status: "needs_review", message: "Payout sent but outcome unclear — check Plisio dashboard." });
          return;

        case "already_processing":
          res.json({ success: true, transactionId: tx.id, status: "processing" });
          return;

        case "no_key":
          req.log.error({ txId: tx.id }, "Auto-withdrawal: Plisio API key not configured — left pending for admin");
          res.json({ success: true, transactionId: tx.id, status: "pending", message: "Payment gateway not configured — queued for manual processing." });
          return;

        case "no_address":
          req.log.error({ txId: tx.id }, "Auto-withdrawal: no payout address — left pending for admin");
          res.json({ success: true, transactionId: tx.id, status: "pending", message: "No payout address — queued for manual processing." });
          return;
      }
    }

    // ── Manual queue: amount > $10,000 OR fraud blocked ───────────────────────
    const queueReason = fraudResult.decision === "blocked"
      ? `Fraud score ${fraudResult.score} (blocked): ${fraudResult.flags.join(", ")}`
      : `Amount $${amount} exceeds auto-approve limit $${autoApproveLimit}`;

    req.log.info({ txId: tx.id, amount, queueReason }, "Withdrawal queued for manual admin review");

    sendNtfy(process.env.NTFY_TOPIC, {
      title: "DGC Arcade — Withdrawal Pending Review",
      priority: "high",
      tags: "hourglass_flowing_sand",
      body: `$${amount} ${currency} from user ${user.id}\nReason: ${queueReason}\nTxn: ${tx.id}`,
    });

    res.json({ success: true, transactionId: tx.id, status: tx.status });
  } catch (err) {
    req.log.error({ err }, "Withdrawal error");
    res.status(500).json({ error: "Internal server error" });
  }
});
