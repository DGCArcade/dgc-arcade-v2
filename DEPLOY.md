# DGC Arcade — Deployment Guide

How your site is wired up and how to ship changes. This reflects your **real** setup:
**GitHub → Render (hosting) → Neon (database) → Plisio (crypto payments).**

---

## 🗺️ Where everything lives

| Thing | What it is | Where it lives |
|---|---|---|
| **Code** | The whole app (frontend + backend) | GitHub → `DGC4/dgc-arcade-v2` |
| **Frontend** | React/Vite site players see | Render service `dgc-arcade-frontend` |
| **Backend** | Express API (`/api`) | Render service `dgc-arcade-api` |
| **Database** | Players, bets, balances, transactions | Neon PostgreSQL (managed separately) |
| **Payments** | Crypto deposits & withdrawals | Plisio |
| **Secrets** | DB URL, JWT secret, Plisio key | Render dashboard (Environment tab) — never in code |

> ⚠️ **Two separate databases.** While developing on Replit you use Replit's
> built-in database. Your **live** site on Render uses your **Neon** database.
> They do not share data — test accounts made on Replit never appear live.

---

## 🚀 How to ship a change (the everyday flow)

Render is set to **auto-deploy** (`autoDeploy: true`). That means:

```
You push to GitHub main  →  Render automatically rebuilds & redeploys both services
```

So the entire deploy is just:

```bash
git add .
git commit -m "describe your change"
git push origin main
```

Within a few minutes Render builds and your live site updates. Watch progress in
the Render dashboard under each service's "Events"/"Logs" tab.

---

## 🔑 Environment variables (set these in Render, not in code)

Both are configured in the Render dashboard → service → **Environment**.
`sync: false` in `render.yaml` means you type the real values into Render by hand.

**`dgc-arcade-api` (backend) needs:**

| Variable | What it is | Where to get it |
|---|---|---|
| `DATABASE_URL` | Neon connection string | https://console.neon.tech → Connection Details |
| `JWT_SECRET` | Signs login tokens | Generate a long random string (see `.env.example`) |
| `PLISIO_SECRET_KEY` | Crypto payments | https://plisio.net → Dashboard → API → Secret Key |
| `SITE_URL` | Your live domain | e.g. `https://differentgrindcrw.com` |
| `API_URL` | Backend API URL | e.g. `https://dgc-arcade-api.onrender.com` (Required for Plisio callbacks) |
| `NODE_ENV` | Set to `production` | (already set in `render.yaml`) |

**`dgc-arcade-frontend` (frontend) needs:** `NODE_ENV=production` (already set).

See `.env.example` for a copy-paste template with explanations.

---

## 💰 Payment flow (Plisio)

```
DEPOSIT
  Player clicks "Deposit"
   → backend calls Plisio API with PLISIO_SECRET_KEY, gets a checkout URL
   → player pays crypto on Plisio's page
   → Plisio sends an IPN webhook to:  POST /api/transactions/deposit/callback
   → backend verifies it came from Plisio's IPs, then credits the balance ✅

WITHDRAW
  Player requests a withdrawal
   → it appears as "pending" in the Admin panel
   → an admin approves it
   → the payout is processed via Plisio ✅
```

Owner-only balance/bank views in the admin panel also read live data from Plisio
using the same `PLISIO_SECRET_KEY`.

---

## 🛠️ First-time / fresh deploy (if rebuilding from scratch)

1. Push the code to GitHub (`DGC4/dgc-arcade-v2`).
2. In Render, create a **Blueprint** from the repo — it reads `render.yaml` and
   creates both services automatically.
3. Add the environment variables above to the `dgc-arcade-api` service.
4. Point your domain's DNS at the Render frontend service (Render gives you the
   target in the service's "Settings → Custom Domain" section).
5. Push to `main` → Render builds and goes live.

---

## 👑 Admin / Owner login

Your owner account is **fanodgc**:
- It can never be banned, deleted, or demoted (enforced in both the API and UI).
- Go to `/admin` for the full admin panel (users, transactions, bank/fraud views).
- Create more players or admins from **Admin → Users → "+ Create User"**.

---

## 🔐 Security reminders

- Real secrets live **only** in Render's Environment tab. Never commit a real `.env`.
- If a secret is ever exposed, rotate it (generate a new one) in its provider and
  update it in Render.
- Database schema is managed via Drizzle; production DB migrations are handled
  separately from local development.

---

## 📞 References

- Plisio API: https://plisio.net/documentation
- Render: https://render.com/docs
- Neon: https://neon.tech/docs
