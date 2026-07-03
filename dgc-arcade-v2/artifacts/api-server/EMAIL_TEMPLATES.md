# DGC Arcade — Transactional Email System

On-brand Resend email templates for DGC Arcade. **7 categories × 3 distinct
variations = 21 templates.** A variation is selected at random on every send, so
users naturally receive different-looking emails over time.

## Where everything lives

| Thing | Path |
|-------|------|
| Email logic + all 21 templates | `artifacts/api-server/src/lib/mail-service.ts` |
| Hosted logo assets | `artifacts/dgc-arcade/public/email-assets/*.jpg` |
| Visual previews (HTML + PNG) | `email-previews/` |
| Contact sheet of all 21 | `email-previews/DGC_Email_Contact_Sheet.png` |

## How logos are hosted

The frontend (`artifacts/dgc-arcade`) is a Vite static site on Render. Anything in
its `public/` folder is served at the web root. The logos sit in
`public/email-assets/`, so once the frontend deploys they are publicly reachable at:

```
https://differentgrindcrew.com/email-assets/DGC_ARCADE_Logo_Gold_Wordmark.jpg
```

Resend renders images from public URLs, so this is exactly what it needs. No CDN
or extra setup required.

## Configuration (env vars)

| Var | Required | Default | Notes |
|-----|----------|---------|-------|
| `RESEND_API_KEY` | yes | — | Your Resend key (already in use) |
| `SENDER_EMAIL` | no | `noreply@differentgrindcrew.com` | From address |
| `SITE_URL` | no | `https://differentgrindcrew.com` | Used for links + default asset base |
| `EMAIL_ASSET_BASE` | no | `${SITE_URL}/email-assets` | Override only if you move logos to a CDN |

> If you ever host the logos elsewhere (e.g. an S3/CDN bucket), just set
> `EMAIL_ASSET_BASE` to that base URL — no code changes needed.

## The 21 templates

| # | Category | Function | Variations (logo / accent) |
|---|----------|----------|----------------------------|
| 1 | Welcome / New Sign-Up | `sendWelcomeEmail` | Gold wordmark, Neon-D, Cyber wordmark |
| 2 | Email Verification | `sendEmailVerificationEmail` | Gold-D, Ocean-D, Cyber-D |
| 3 | Login Security Alert | `sendLoginSecurityEmail` | Blood-D, Classic wordmark, Futuristic-D |
| 4 | Deposit Confirmed | `sendDepositEmail` | Golden-D-space, Cyber-D, Neon-D |
| 5 | Withdrawal Processed | `sendWithdrawalEmail` | Golden-D-space, Ocean-D, Cyber-D |
| 6 | Password Reset | `sendPasswordResetEmail` | Gold-D, Volcanic-D, Futuristic-D |
| 7 | Suspicious Activity | `sendSuspiciousActivityEmail` | Blood-D, Volcanic-D, Futuristic-D |

**All public function signatures are unchanged** — existing callers in
`routes/admin.ts` (test-email panel) and `routes/users.ts` (verification) keep
working with zero changes.

## Brand details baked in

- **Tagline (footer, rotating):** "THE STREETS ALWAYS WIN", "GET PAID OR GET
  PLAYED", "PROVABLY FAIR • INSTANT PAYOUTS • NO BS"
- **Glow:** animated multi-color glow via CSS `@keyframes` for clients that
  support it, **plus** a strong baked-in static glow (`text-shadow` /
  `box-shadow` + the glow already burned into the logo PNGs) so it looks great in
  Gmail / Outlook / Apple Mail, which strip animations.
- **Voice:** street-luxury, confident, "Yo {username}", "get paid or get played",
  "no BS".
- **Layout:** table-based HTML (the structure email clients actually respect),
  600px max width, mobile responsive, dark theme on `#050507`.

## Email-client compatibility notes

- Images are JPEG, 8–32 KB each — fast loading, won't trip Gmail's ~102 KB
  clipping limit.
- Animations are progressive enhancement only; every email is fully legible and
  on-brand without them.
- A hidden preheader is set per email for a clean inbox preview line.

## Regenerating previews

```bash
node scripts/render_email_previews.mjs   # writes 21 HTML files to email-previews/
bash scripts/shoot_previews.sh           # screenshots them to email-previews/png/
python3 scripts/build_contact_sheet.py   # builds the combined contact sheet
```

## Rollback

The original single-template service was replaced in place. To revert, restore
`mail-service.ts` from git history:

```bash
git log --oneline -- artifacts/api-server/src/lib/mail-service.ts
git checkout <old-commit> -- artifacts/api-server/src/lib/mail-service.ts
```
