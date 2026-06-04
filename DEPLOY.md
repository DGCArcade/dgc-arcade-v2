# DGC Arcade — Deployment Guide
## Moving from Replit → GitHub → Your VPS (IONOS)

---

## 🗃️ WHERE EVERYTHING IS STORED (Kindergarten Edition)

Think of it like a restaurant:

| Thing | What it is | Where it lives |
|---|---|---|
| **Your code** | The recipe book | GitHub (free) |
| **Your database** | The ingredient storage | PostgreSQL — needs a host (see below) |
| **Your files/assets** | The menu printouts | GitHub (code) / CDN if you add images |
| **Your server** | The kitchen/cook | IONOS VPS (runs 24/7) |
| **Your domain** | The restaurant address | IONOS DNS → DifferentGrindCrw.com |
| **Player money** | Crypto wallets | OxaPay handles it — you never touch it directly |
| **API Keys** | The safe codes | `.env` file on your VPS — NEVER in GitHub |

---

## 📦 STEP 1 — Push Code to GitHub

**From your computer (after downloading from Replit):**

```bash
# Unzip the downloaded code
unzip dgc-arcade-deploy.zip
cd dgc-arcade-deploy

# Initialize git (if not already)
git init
git remote add origin https://github.com/YOUR_USERNAME/dgc-arcade.git

# Push to GitHub
git add .
git commit -m "DGC Arcade — initial deploy"
git push -u origin main
```

**IMPORTANT:** The `.env` file is in `.gitignore` — it will NOT be pushed. Good. Your secrets stay private.

---

## 🖥️ STEP 2 — Set Up Your IONOS VPS

1. Buy a VPS from ionos.com (Linux Ubuntu 22.04, at least 2GB RAM recommended)
2. SSH into it: `ssh root@YOUR_VPS_IP`
3. Install Node.js 20+:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt-get install -y nodejs
   npm install -g pnpm pm2
   ```
4. Install PostgreSQL:
   ```bash
   apt-get install -y postgresql postgresql-contrib
   sudo -u postgres psql -c "CREATE DATABASE dgcarcade;"
   sudo -u postgres psql -c "CREATE USER dgcuser WITH PASSWORD 'yourpassword';"
   sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE dgcarcade TO dgcuser;"
   ```

---

## 🔑 STEP 3 — Add Your API Keys (on VPS)

```bash
# On your VPS, create the .env file:
nano /var/www/dgc-arcade/.env
```

Paste in your values (see `.env.example`):
```
DATABASE_URL=postgresql://dgcuser:yourpassword@localhost:5432/dgcarcade
SESSION_SECRET=paste_your_64_char_random_string_here
OXAPAY_MERCHANT_KEY=your_key_from_oxapay_dashboard
OXAPAY_PAYOUT_KEY=your_payout_key_from_oxapay_dashboard
SITE_URL=https://differentgrindcrw.com
NODE_ENV=production
PORT=8080
```

**Where to get OxaPay keys:**
1. Go to https://oxapay.com
2. Sign up / Log in
3. Dashboard → Create Merchant → copy the Merchant Key
4. Dashboard → Payout API → copy the Payout Key

---

## 🌐 STEP 4 — IONOS DNS Setup

In your IONOS control panel for DifferentGrindCrw.com:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | @ | YOUR_VPS_IP | 3600 |
| A | www | YOUR_VPS_IP | 3600 |
| CNAME | api | @ | 3600 |

The site runs at root `/` (frontend) and `/api` (backend) — both served from the same VPS.

---

## 🚀 STEP 5 — Deploy the Code on VPS

```bash
# Clone from GitHub
cd /var/www
git clone https://github.com/YOUR_USERNAME/dgc-arcade.git
cd dgc-arcade

# Install dependencies
pnpm install

# Run database migrations
pnpm --filter @workspace/db run push

# Build the frontend
pnpm --filter @workspace/dgc-arcade run build

# Build the API server
pnpm --filter @workspace/api-server run build

# Start with PM2 (keeps it running 24/7)
pm2 start "node --enable-source-maps artifacts/api-server/dist/index.mjs" --name dgc-api
pm2 start "npx serve -s artifacts/dgc-arcade/dist -l 3000" --name dgc-web
pm2 save
pm2 startup
```

---

## 🔒 STEP 6 — SSL Certificate (HTTPS)

```bash
apt-get install -y certbot
certbot --nginx -d differentgrindcrw.com -d www.differentgrindcrw.com
```

---

## 🔄 STEP 7 — Update Your Site (After Changes)

When you update code on GitHub:
```bash
cd /var/www/dgc-arcade
git pull origin main
pnpm install
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/dgc-arcade run build
pm2 restart all
```

---

## 💰 PAYMENT FLOW (OxaPay)

```
Player clicks "Deposit" 
  → Your site calls OxaPay API with your Merchant Key
  → OxaPay generates a payment address (BTC/ETH/USDT etc.)
  → Player sends crypto to that address
  → OxaPay sends a webhook to your site: POST /api/transactions/oxapay-webhook
  → Your site adds balance to player account ✅

Player clicks "Withdraw"
  → Request goes to Admin panel (pending)
  → You approve it in admin panel
  → Your site calls OxaPay Payout API with your Payout Key
  → Crypto sent to player wallet automatically ✅
```

---

## 👑 ADMIN LOGIN

Your owner account: **fanodgc**
- Set your password when you first register on the site
- Go to `/admin` to access the full admin panel
- This account can NEVER be banned, deleted, or demoted by anyone

To make yourself admin (first time):
```bash
# On your VPS or Replit:
psql $DATABASE_URL -c "UPDATE users SET role='admin' WHERE username='fanodgc';"
```

---

## 🐙 GITHUB SECRETS (Optional — for CI/CD)

If you want GitHub to auto-deploy when you push:
1. Go to GitHub → Your Repo → Settings → Secrets and Variables → Actions
2. Add these secrets:
   - `VPS_HOST` — your VPS IP
   - `VPS_USER` — usually `root`
   - `VPS_SSH_KEY` — your private SSH key

---

## 📞 SUPPORT

- OxaPay docs: https://oxapay.com/developers
- PM2 docs: https://pm2.keymetrics.io
- Curaçao Gaming info: https://www.gaming-curacao.com
