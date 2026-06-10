import { readFileSync, writeFileSync } from 'fs';

const file = 'artifacts/api-server/src/routes/admin.ts';
let code = readFileSync(file, 'utf8');

const oldBlock = `adminRouter.get("/bank/balances", async (req, res) => {
  const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? "";
  if (!PLISIO_KEY) {
    res.status(500).json({ error: "PLISIO_SECRET_KEY not set" });
    return;
  }
  try {
    const params = new URLSearchParams({ api_key: PLISIO_KEY });
    const resp = await fetch(\`https://api.plisio.net/api/v1/balances?\${params.toString()}\`);
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
});`;

const newBlock = `adminRouter.get("/bank/balances", async (req, res) => {
  const PLISIO_KEY = process.env.PLISIO_SECRET_KEY ?? "";
  if (!PLISIO_KEY) {
    res.status(500).json({ error: "PLISIO_SECRET_KEY not set" });
    return;
  }
  try {
    const currencies = ["BTC","ETH","LTC","DOGE","BCH","XMR","DASH","USDT_TRX","USDT_TON","TRX","TON","SOL"];
    const balances: Record<string, { balance: string; allowed: number }> = {};
    await Promise.all(
      currencies.map(async (cur) => {
        try {
          const params = new URLSearchParams({ api_key: PLISIO_KEY });
          const resp = await fetch(\`https://api.plisio.net/api/v1/currencies/\${cur}?\${params.toString()}\`);
          const data = await resp.json() as { status: string; data?: { balance?: string; allowed?: number } };
          if (data.status === "success" && data.data) {
            balances[cur] = { balance: data.data.balance ?? "0", allowed: data.data.allowed ?? 0 };
          }
        } catch { /* skip failed currencies */ }
      })
    );
    res.json({ balances });
  } catch (err) {
    req.log.error({ err }, "Bank balances error");
    res.status(500).json({ error: "Internal server error" });
  }
});`;

if (code.includes(oldBlock)) {
  code = code.replace(oldBlock, newBlock);
  writeFileSync(file, code);
  console.log('✅ Balances endpoint patched!');
} else {
  console.log('❌ Could not find the block to replace. Code may have changed.');
}
