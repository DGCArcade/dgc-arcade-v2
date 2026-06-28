import { Resend } from "resend";

// ──────────────────────────────────────────────────────────────────────────────
// DGC ARCADE — Transactional Email Service (Resend)
//
// 7 categories × 3 distinct variations = 21 on-brand templates.
//   Each variation has its OWN logo, color accent, layout, copy, and subject line.
//   A variation is chosen at random on every send, so users naturally see variety.
//
// Brand system:
//   - Tagline: "THE STREETS ALWAYS WIN" (forever-glow)
//   - Voice: street-luxury, confident, "Get paid or get played", "No BS"
//   - Glow: animated multi-color glow for clients that support @keyframes,
//           PLUS a strong baked-in static glow (text-shadow / box-shadow) that
//           renders everywhere (Gmail, Outlook, Apple Mail strip animations).
//   - Logos: real DGC PNG/JPG assets hosted at /email-assets on the live site.
//
// Public function signatures are UNCHANGED so existing callers keep working.
// ──────────────────────────────────────────────────────────────────────────────

const resend = new Resend(process.env.RESEND_API_KEY);
const SENDER_EMAIL = process.env.SENDER_EMAIL || "noreply@differentgrindcrew.com";
const SITE_URL = process.env.SITE_URL || "https://differentgrindcrew.com";

// Where the hosted logo assets live. Defaults to the live site's /email-assets
// folder (served from artifacts/dgc-arcade/public/email-assets). Override with
// EMAIL_ASSET_BASE if you host the images elsewhere (e.g. a CDN).
const ASSET_BASE = (
  process.env.EMAIL_ASSET_BASE || `${SITE_URL.replace(/\/$/, "")}/email-assets`
).replace(/\/$/, "");

// ── Brand asset catalog ───────────────────────────────────────────────────────
const LOGOS = {
  // Wordmarks (600×337)
  wordmarkGold: `${ASSET_BASE}/DGC_ARCADE_Logo_Gold_Wordmark.jpg`,
  wordmarkClassic: `${ASSET_BASE}/DGC_ARCADE_Logo_Wordmark.jpg`,
  wordmarkNeon: `${ASSET_BASE}/DGC_ARCADE_Logo_Neon_Wordmark.jpg`,
  wordmarkCyber: `${ASSET_BASE}/DGC_ARCADE_Logo_Cyber_Wordmark.jpg`,
  // "D" icons (240×240)
  dGold: `${ASSET_BASE}/DGC_D_Logo_Gold.jpg`,
  dGoldSpace: `${ASSET_BASE}/DGC_Logo_Golden_D.jpg`,
  dCyber: `${ASSET_BASE}/DGC_D_Logo_Cyber.jpg`,
  dFuturistic: `${ASSET_BASE}/DGC_D_Logo_Futuristic.jpg`,
  dBlood: `${ASSET_BASE}/DGC_D_Logo_Blood.jpg`,
  dOcean: `${ASSET_BASE}/DGC_D_Logo_Ocean.jpg`,
  dNeon: `${ASSET_BASE}/DGC_D_Logo_Neon.jpg`,
  dVolcanic: `${ASSET_BASE}/DGC_D_Logo_Volcanic.jpg`,
} as const;

// ── Color accents per theme (hex used for glows, borders, buttons) ─────────────
type Accent = {
  glow: string; // primary accent color
  glow2: string; // secondary accent color for gradients
  text: string; // readable accent for text on dark bg
  buttonText: string; // text color on a solid accent button
};

const ACCENTS = {
  gold: { glow: "#FFD700", glow2: "#FF8800", text: "#FFD700", buttonText: "#080c18" },
  neon: { glow: "#FF1FA2", glow2: "#FF66C4", text: "#FF66C4", buttonText: "#0a0a0a" },
  cyber: { glow: "#39FF14", glow2: "#00FF87", text: "#5BFF4D", buttonText: "#06120a" },
  ocean: { glow: "#00D4FF", glow2: "#1E90FF", text: "#5BD6FF", buttonText: "#03121a" },
  purple: { glow: "#B44FFF", glow2: "#8A2BE2", text: "#C98BFF", buttonText: "#0a0612" },
  blood: { glow: "#FF2D2D", glow2: "#B30000", text: "#FF6B6B", buttonText: "#120303" },
  volcanic: { glow: "#FF6A00", glow2: "#FF3D00", text: "#FF9A4D", buttonText: "#120703" },
} as const;

type AccentName = keyof typeof ACCENTS;

// ── Utilities ─────────────────────────────────────────────────────────────────
function generateVerificationCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Deterministic-ish random pick (0..n-1)
function pick(n: number): number {
  return Math.floor(Math.random() * n);
}

const FOOTER_TAGLINES = [
  "THE STREETS ALWAYS WIN",
  "GET PAID OR GET PLAYED",
  "PROVABLY FAIR • INSTANT PAYOUTS • NO BS",
];

// Shared <head> styles. `accent` drives the glow colors. The animated glow is a
// progressive enhancement; the inline text-shadow/box-shadow on elements is the
// static fallback that renders in every client.
function headStyles(accent: Accent): string {
  return `
  <style>
    @keyframes glow-pulse {
      0%, 100% { box-shadow: 0 0 18px ${hexA(accent.glow, 0.55)}, 0 0 38px ${hexA(accent.glow, 0.28)}; }
      50% { box-shadow: 0 0 26px ${hexA(accent.glow2, 0.65)}, 0 0 60px ${hexA(accent.glow2, 0.35)}; }
    }
    @keyframes text-flicker {
      0%, 100% { text-shadow: 0 0 8px ${hexA(accent.glow, 0.8)}, 0 0 18px ${hexA(accent.glow, 0.45)}; }
      50% { text-shadow: 0 0 14px ${hexA(accent.glow2, 0.9)}, 0 0 28px ${hexA(accent.glow2, 0.5)}; }
    }
    body { margin:0; padding:0; background:#050507;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Space Grotesk',Helvetica,Arial,sans-serif; }
    .glow-anim { animation: glow-pulse 5s ease-in-out infinite; }
    .text-anim { animation: text-flicker 5s ease-in-out infinite; }
    a { text-decoration:none; }
    @media (max-width:620px){
      .container{ width:100% !important; }
      .px{ padding-left:22px !important; padding-right:22px !important; }
      .logo-w{ width:230px !important; }
    }
  </style>`;
}

// hex + alpha → rgba()
function hexA(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Reusable building blocks (table-based for email-client compatibility) ──────

function wordmarkHeader(logoUrl: string, accent: Accent): string {
  return `
  <tr>
    <td align="center" style="padding:38px 20px 30px; background:linear-gradient(135deg,#070a14 0%,#0e1326 100%); border-bottom:2px solid ${accent.glow};">
      <div class="glow-anim" style="display:inline-block; border-radius:14px; box-shadow:0 0 22px ${hexA(accent.glow, 0.45)}, 0 0 44px ${hexA(accent.glow, 0.22)};">
        <img src="${logoUrl}" alt="DGC ARCADE" class="logo-w" width="300" style="width:300px; max-width:82%; height:auto; display:block; border-radius:12px;">
      </div>
    </td>
  </tr>`;
}

function iconHeader(iconUrl: string, accent: Accent, kicker: string): string {
  return `
  <tr>
    <td align="center" style="padding:40px 20px 14px; background:radial-gradient(circle at 50% 0%, ${hexA(accent.glow, 0.16)} 0%, #070a14 60%); border-bottom:2px solid ${accent.glow};">
      <div class="glow-anim" style="display:inline-block; border-radius:50%; box-shadow:0 0 26px ${hexA(accent.glow, 0.6)}, 0 0 52px ${hexA(accent.glow, 0.3)};">
        <img src="${iconUrl}" alt="DGC" width="92" height="92" style="width:92px; height:92px; display:block; border-radius:18px;">
      </div>
      <div class="text-anim" style="margin-top:16px; font-size:13px; letter-spacing:3px; font-weight:700; color:${accent.text}; text-transform:uppercase; text-shadow:0 0 12px ${hexA(accent.glow, 0.7)};">
        ${kicker}
      </div>
    </td>
  </tr>`;
}

function footer(accent: Accent): string {
  const tagline = FOOTER_TAGLINES[pick(FOOTER_TAGLINES.length)];
  return `
  <tr>
    <td align="center" style="padding:30px 24px 36px; background:#050507; border-top:1px solid ${hexA(accent.glow, 0.22)};">
      <div class="text-anim" style="font-size:15px; font-weight:800; letter-spacing:2px; color:${accent.text}; text-shadow:0 0 14px ${hexA(accent.glow, 0.7)};">
        ${tagline}
      </div>
      <div style="margin-top:14px; font-size:12px; color:#6a6a72; line-height:1.7;">
        Provably Fair &nbsp;•&nbsp; Instant Payouts &nbsp;•&nbsp; No BS<br>
        © 2026 DGC Arcade. All rights reserved.
      </div>
      <div style="margin-top:16px;">
        <a href="https://instagram.com/DGCARCADE" style="color:${accent.text}; font-size:12px; margin:0 8px;">Instagram</a>
        <a href="https://x.com/DGCARCADE" style="color:${accent.text}; font-size:12px; margin:0 8px;">X</a>
        <a href="https://t.me/DGCARCADE" style="color:${accent.text}; font-size:12px; margin:0 8px;">Telegram</a>
      </div>
    </td>
  </tr>`;
}

// Shell that wraps header + body content + footer into a full HTML document.
function shell(opts: {
  accentName: AccentName;
  header: string;
  body: string;
  preheader?: string;
}): string {
  const accent = ACCENTS[opts.accentName];
  const pre = opts.preheader || "DGC Arcade — The Streets Always Win.";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  ${headStyles(accent)}
</head>
<body style="margin:0; padding:0; background:#050507;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:#050507; font-size:1px; line-height:1px;">${pre}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#050507; padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:600px; background:#0a0e1a; border-radius:16px; overflow:hidden; border:1px solid ${hexA(accent.glow, 0.25)};">
        ${opts.header}
        <tr><td class="px" style="padding:36px 38px 8px; color:#e7e7ee;">
          ${opts.body}
        </td></tr>
        ${footer(accent)}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Inline styled snippets used inside body content ───────────────────────────
function btn(href: string, label: string, accent: Accent): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td align="center" bgcolor="${accent.glow}" style="border-radius:10px; box-shadow:0 0 20px ${hexA(accent.glow, 0.5)};">
    <a href="${href}" style="display:inline-block; padding:15px 42px; font-size:16px; font-weight:800; letter-spacing:0.5px; color:${accent.buttonText}; background:${accent.glow}; border-radius:10px;">${label}</a>
  </td></tr></table>`;
}

function btnOutline(href: string, label: string, accent: Accent): string {
  return `<a href="${href}" style="display:inline-block; padding:13px 34px; font-size:15px; font-weight:700; color:${accent.text}; border:2px solid ${accent.glow}; border-radius:10px; margin:6px 4px;">${label}</a>`;
}

function codeBox(label: string, code: string, expires: string, accent: Accent): string {
  return `<div class="glow-anim" style="background:linear-gradient(135deg,#11162a 0%,#0a0e1a 100%); border:2px solid ${accent.glow}; border-radius:14px; padding:26px; text-align:center; margin:26px 0; box-shadow:0 0 22px ${hexA(accent.glow, 0.4)};">
    <div style="font-size:11px; letter-spacing:2px; color:#8a8a96; text-transform:uppercase;">${label}</div>
    <div class="text-anim" style="font-family:'Space Mono','Courier New',monospace; font-size:38px; font-weight:800; letter-spacing:8px; color:${accent.text}; margin:14px 0; text-shadow:0 0 16px ${hexA(accent.glow, 0.7)};">${code}</div>
    <div style="font-size:12px; color:${accent.text};">${expires}</div>
  </div>`;
}

function infoBox(text: string, color: string): string {
  return `<div style="background:${hexA(color, 0.1)}; border-left:4px solid ${color}; padding:14px 16px; border-radius:6px; font-size:13px; color:#cfd4dd; margin:20px 0; line-height:1.6;">${text}</div>`;
}

function dataRows(rows: Array<[string, string]>, accent: Accent): string {
  const inner = rows
    .map(
      ([k, v]) =>
        `<div style="margin:6px 0; font-size:14px; color:#cfd4dd;"><strong style="color:${accent.text};">${k}</strong> ${v}</div>`
    )
    .join("");
  return `<div style="background:linear-gradient(135deg,#11162a 0%,#0a0e1a 100%); border:1px solid ${hexA(accent.glow, 0.4)}; border-radius:12px; padding:20px 22px; margin:22px 0; box-shadow:0 0 18px ${hexA(accent.glow, 0.25)};">${inner}</div>`;
}

function h(text: string, accent: Accent): string {
  return `<div style="font-size:21px; font-weight:800; color:${accent.text}; margin:24px 0 10px; text-shadow:0 0 12px ${hexA(accent.glow, 0.4)};">${text}</div>`;
}

function p(text: string): string {
  return `<p style="font-size:15px; line-height:1.7; color:#d6d9e0; margin:14px 0;">${text}</p>`;
}

function hl(text: string, accent: Accent): string {
  return `<span style="color:${accent.text}; font-weight:700;">${text}</span>`;
}

function divider(accent: Accent): string {
  return `<div style="height:1px; background:linear-gradient(90deg,transparent,${accent.glow},transparent); margin:28px 0;"></div>`;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ 1. WELCOME / NEW SIGN-UP — 3 variations                                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const welcomeVariants: Array<
  (username: string, userType: string) => { subject: string; html: string }
> = [
  // V1 — Gold "Welcome to the Elite"
  (username, userType) => {
    const accent = ACCENTS.gold;
    const body = `
      ${h(`Welcome to the Elite, @${username}`, accent)}
      ${p(`You just locked in your spot at ${hl("DGC Arcade", accent)} as a ${hl(userType.toUpperCase(), accent)}. From here on out — it's get paid or get played.`)}
      ${infoBox("✅ Your account is live and ready to roll.", accent.glow)}
      ${h("What you can do right now", accent)}
      ${p(`🎰 Run provably fair games — Blackjack, Mines, Coin Flip<br>💰 Deposit &amp; cash out real crypto, instantly<br>🔐 Your funds, your keys, your control<br>⚡ No KYC headaches — just play<br>📊 Track every stat in real time`)}
      ${btn(`${SITE_URL}/dashboard`, "Enter the Arcade", accent)}
      ${infoBox("💡 Pro tip: verify your email to unlock withdrawals and every feature.", "#00D4FF")}
    `;
    return {
      subject: "Welcome to DGC Arcade — The Streets Always Win 🎰",
      html: shell({ accentName: "gold", header: wordmarkHeader(LOGOS.wordmarkGold, accent), body, preheader: "You're in. Time to get paid or get played." }),
    };
  },
  // V2 — Neon "The doors just opened"
  (username, userType) => {
    const accent = ACCENTS.neon;
    const body = `
      ${h(`The doors just opened, ${username} 🔥`, accent)}
      ${p(`Welcome to ${hl("DGC Arcade", accent)} — the streets' favorite arcade. Your ${hl(userType, accent)} account is loaded and waiting.`)}
      ${dataRows([["🎮 Status:", "ACTIVE"], ["⚡ Access:", "FULL FLOOR"], ["🏆 Mission:", "Stack it up"]], accent)}
      ${p("This isn't another rigged house. Every game is provably fair, every payout is instant, and there's zero BS standing between you and your bag.")}
      ${btn(`${SITE_URL}/games`, "Hit the Floor", accent)}
      ${divider(accent)}
      ${p("Verify your email when you get a sec — it switches on withdrawals and the rest of the perks.")}
    `;
    return {
      subject: `Welcome to the floor, ${username} 💎 — DGC Arcade`,
      html: shell({ accentName: "neon", header: iconHeader(LOGOS.dNeon, accent, "New Member"), body, preheader: "The streets' favorite arcade just let you in." }),
    };
  },
  // V3 — Cyber "Player one, ready"
  (username, userType) => {
    const accent = ACCENTS.cyber;
    const body = `
      ${h(`Player One Ready — Welcome, ${username}`, accent)}
      ${p(`Your ${hl("DGC Arcade", accent)} ${hl(userType, accent)} account just booted up. Green light's on. Let's get it.`)}
      ${infoBox("✅ Account verified live. Balance ready. Games unlocked.", accent.glow)}
      ${h("Your starting kit", accent)}
      ${p(`🎰 Provably fair games on deck<br>💸 Instant crypto deposits &amp; payouts<br>🛡️ Self-custody — you hold the keys<br>📈 Live stats &amp; leaderboards`)}
      ${btn(`${SITE_URL}/dashboard`, "Start Playing", accent)}
      ${p("One move left: confirm your email to flip on withdrawals.")}
    `;
    return {
      subject: "🟢 Player One Ready — Welcome to DGC Arcade",
      html: shell({ accentName: "cyber", header: wordmarkHeader(LOGOS.wordmarkCyber, accent), body, preheader: "Green light's on. Your account is live." }),
    };
  },
];

export async function sendWelcomeEmail(
  email: string,
  username: string,
  userType: string
): Promise<void> {
  const { subject, html } = welcomeVariants[pick(welcomeVariants.length)](username, userType);
  await resend.emails.send({ from: SENDER_EMAIL, to: email, subject, html });
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ 2. EMAIL VERIFICATION — 3 variations                                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const verifyVariants: Array<
  (username: string, code: string) => { subject: string; html: string }
> = [
  // V1 — Gold, classic code box
  (username, code) => {
    const accent = ACCENTS.gold;
    const body = `
      ${h("Verify Your Email", accent)}
      ${p(`Yo ${hl(username, accent)} — confirm your email to unlock every DGC Arcade feature, including withdrawals.`)}
      ${codeBox("Your 6-Character Code", code, "⏱️ Expires in 24 hours", accent)}
      ${h("Two ways to verify", accent)}
      ${p(`<strong>Option 1:</strong> Drop the code above into your account settings.<br><strong>Option 2:</strong> Tap the button below.`)}
      ${btn(`${SITE_URL}/verify/${code}`, "Verify Email Now", accent)}
      ${infoBox("🔒 Security: never share this code. We'll never ask for it by email or support.", "#FF6B6B")}
    `;
    return {
      subject: "Verify Your Email — DGC Arcade",
      html: shell({ accentName: "gold", header: iconHeader(LOGOS.dGold, accent, "Verify"), body, preheader: `Your code: ${code}` }),
    };
  },
  // V2 — Ocean, "one tap away"
  (username, code) => {
    const accent = ACCENTS.ocean;
    const body = `
      ${h(`One tap from the full floor, ${username}`, accent)}
      ${p(`You're almost in. Verify your email and DGC Arcade opens all the way up — withdrawals, bonuses, the works.`)}
      ${codeBox("Verification Code", code, "⏱️ Good for the next 24 hours", accent)}
      ${btn(`${SITE_URL}/verify/${code}`, "Confirm My Email", accent)}
      ${infoBox("💡 Didn't sign up for DGC Arcade? You can safely ignore this email.", accent.glow)}
    `;
    return {
      subject: `${username}, confirm your email to unlock withdrawals 🌊`,
      html: shell({ accentName: "ocean", header: iconHeader(LOGOS.dOcean, accent, "Confirm Email"), body, preheader: `One tap to unlock everything — code ${code}` }),
    };
  },
  // V3 — Cyber, system-boot style
  (username, code) => {
    const accent = ACCENTS.cyber;
    const body = `
      ${h("Email Verification Required", accent)}
      ${p(`Access request received for ${hl(username, accent)}. Enter the key below to complete activation.`)}
      ${codeBox(">> ACCESS KEY", code, "EXPIRES: 24:00:00", accent)}
      ${p("Paste it in your settings, or hit the button to verify instantly.")}
      ${btn(`${SITE_URL}/verify/${code}`, "Activate Account", accent)}
      ${infoBox("🛡️ This key is single-use. Never share it — DGC staff will never request it.", "#FF6B6B")}
    `;
    return {
      subject: "🟢 Action Required: Verify Your DGC Arcade Email",
      html: shell({ accentName: "cyber", header: iconHeader(LOGOS.dCyber, accent, "Activation Key"), body, preheader: `Access key inside — ${code}` }),
    };
  },
];

export async function sendEmailVerificationEmail(
  email: string,
  username: string,
  code: string
): Promise<void> {
  const { subject, html } = verifyVariants[pick(verifyVariants.length)](username, code);
  await resend.emails.send({ from: SENDER_EMAIL, to: email, subject, html });
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ 3. LOGIN SECURITY ALERT — 3 variations                                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const loginVariants: Array<
  (username: string, ip: string, location: string, device: string) => { subject: string; html: string }
> = [
  // V1 — Blood red alert
  (username, ip, location, device) => {
    const accent = ACCENTS.blood;
    const body = `
      ${h("New Login Detected", accent)}
      ${p(`Yo ${hl(username, accent)} — somebody just signed into your DGC Arcade account. If it was you, you're good. If not, lock it down now.`)}
      ${dataRows([["🌍 Location:", location], ["🔗 IP:", ip], ["💻 Device:", device], ["⏰ Time:", new Date().toLocaleString()]], accent)}
      <div style="text-align:center; margin:8px 0;">
        ${btnOutline(`${SITE_URL}/security/confirm`, "✅ That Was Me", accent)}
        ${btnOutline(`${SITE_URL}/security/suspicious`, "🚫 Not Me", accent)}
      </div>
      ${infoBox("🔒 If this wasn't you, hit \"Not Me\" right away. We'll lock the account and walk you through a password reset.", accent.glow)}
    `;
    return {
      subject: "🚨 New Login on Your DGC Arcade Account",
      html: shell({ accentName: "blood", header: iconHeader(LOGOS.dBlood, accent, "Security Alert"), body, preheader: `New sign-in from ${location}` }),
    };
  },
  // V2 — Gold, calm & professional
  (username, ip, location, device) => {
    const accent = ACCENTS.gold;
    const body = `
      ${h("Heads up — new sign-in", accent)}
      ${p(`Hey ${hl(username, accent)}, we noticed a fresh login to your account. Just keeping you in the loop.`)}
      ${dataRows([["📍 Where:", location], ["🌐 IP address:", ip], ["🖥️ Device:", device], ["🕒 When:", new Date().toLocaleString()]], accent)}
      ${p("Recognize it? No action needed. Don't recognize it? Secure your account in one tap.")}
      ${btn(`${SITE_URL}/security/suspicious`, "Secure My Account", accent)}
      ${infoBox("💡 Turn on 2FA in settings for an extra lock on your bag.", "#00D4FF")}
    `;
    return {
      subject: "New sign-in to your DGC Arcade account",
      html: shell({ accentName: "gold", header: wordmarkHeader(LOGOS.wordmarkClassic, accent), body, preheader: `Sign-in from ${device} • ${location}` }),
    };
  },
  // V3 — Purple, futuristic monitor
  (username, ip, location, device) => {
    const accent = ACCENTS.purple;
    const body = `
      ${h("Access Event Logged", accent)}
      ${p(`Account ${hl(username, accent)} was just accessed. Review the details below and confirm it was you.`)}
      ${dataRows([["🛰️ Origin:", location], ["🔗 IP:", ip], ["📟 Device:", device], ["⏱️ Timestamp:", new Date().toLocaleString()]], accent)}
      <div style="text-align:center; margin:8px 0;">
        ${btnOutline(`${SITE_URL}/security/confirm`, "Confirm It Was Me", accent)}
        ${btnOutline(`${SITE_URL}/security/suspicious`, "Report Intrusion", accent)}
      </div>
      ${infoBox("🛡️ Unrecognized access? Report it and we'll freeze the account instantly.", "#FF6B6B")}
    `;
    return {
      subject: "🔐 Access Event on Your DGC Arcade Account",
      html: shell({ accentName: "purple", header: iconHeader(LOGOS.dFuturistic, accent, "Access Log"), body, preheader: `Access from ${location}` }),
    };
  },
];

export async function sendLoginSecurityEmail(
  email: string,
  username: string,
  ipAddress: string,
  location: string,
  device: string
): Promise<void> {
  const { subject, html } = loginVariants[pick(loginVariants.length)](username, ipAddress, location, device);
  await resend.emails.send({ from: SENDER_EMAIL, to: email, subject, html });
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ 4. DEPOSIT CONFIRMATION — 3 variations                                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const depositVariants: Array<
  (username: string, amount: string, txHash: string) => { subject: string; html: string }
> = [
  // V1 — Gold, celebratory
  (username, amount, txHash) => {
    const accent = ACCENTS.gold;
    const body = `
      ${h("Deposit Confirmed 💰", accent)}
      ${p(`Yo ${hl(username, accent)}, your deposit cleared and it's locked into your balance. Time to make it work.`)}
      ${infoBox(`✅ <strong>${amount}</strong> added to your balance.`, accent.glow)}
      ${dataRows([["💵 Amount:", hl(amount, accent)], ["🔗 Transaction:", txHash], ["✅ Status:", "CONFIRMED"]], accent)}
      ${btn(`${SITE_URL}/games`, "Start Playing", accent)}
      ${infoBox("💡 Your balance is live. Play smart, win big — the streets always win.", "#00D4FF")}
    `;
    return {
      subject: `💰 Deposit Confirmed — ${amount} added • DGC Arcade`,
      html: shell({ accentName: "gold", header: iconHeader(LOGOS.dGoldSpace, accent, "Deposit In"), body, preheader: `${amount} is in your balance.` }),
    };
  },
  // V2 — Cyber, "funds loaded"
  (username, amount, txHash) => {
    const accent = ACCENTS.cyber;
    const body = `
      ${h("Funds Loaded ⚡", accent)}
      ${p(`${hl(username, accent)}, the chain confirmed it — your deposit is in and ready to ride.`)}
      ${dataRows([["💸 Credited:", hl(amount, accent)], ["🔗 Tx hash:", txHash], ["🟢 Status:", "CONFIRMED ON-CHAIN"]], accent)}
      ${p("No holds, no delays. Your full balance is playable right now.")}
      ${btn(`${SITE_URL}/games`, "Hit the Tables", accent)}
    `;
    return {
      subject: `⚡ ${amount} Loaded — DGC Arcade`,
      html: shell({ accentName: "cyber", header: iconHeader(LOGOS.dCyber, accent, "Funds Loaded"), body, preheader: `${amount} confirmed on-chain.` }),
    };
  },
  // V3 — Neon, "bag secured"
  (username, amount, txHash) => {
    const accent = ACCENTS.neon;
    const body = `
      ${h("Bag Secured 💎", accent)}
      ${p(`Money moves, ${hl(username, accent)}. Your deposit hit and your balance just went up.`)}
      ${infoBox(`✅ <strong>${amount}</strong> is now in play.`, accent.glow)}
      ${dataRows([["💵 Amount:", hl(amount, accent)], ["🔗 Transaction:", txHash], ["💎 Status:", "CONFIRMED"]], accent)}
      ${btn(`${SITE_URL}/games`, "Run It Up", accent)}
      ${p("Get paid or get played. Make the right moves.")}
    `;
    return {
      subject: `💎 Bag Secured — ${amount} in play • DGC Arcade`,
      html: shell({ accentName: "neon", header: iconHeader(LOGOS.dNeon, accent, "Deposit Confirmed"), body, preheader: `${amount} is now in play.` }),
    };
  },
];

export async function sendDepositEmail(
  email: string,
  username: string,
  amount: string,
  txHash: string
): Promise<void> {
  const { subject, html } = depositVariants[pick(depositVariants.length)](username, amount, txHash);
  await resend.emails.send({ from: SENDER_EMAIL, to: email, subject, html });
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ 5. WITHDRAWAL CONFIRMATION — 3 variations                                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const withdrawalVariants: Array<
  (username: string, amount: string, txHash: string) => { subject: string; html: string }
> = [
  // V1 — Gold, reassuring
  (username, amount, txHash) => {
    const accent = ACCENTS.gold;
    const body = `
      ${h("Withdrawal Processed 🚀", accent)}
      ${p(`Yo ${hl(username, accent)}, your cashout is on the move — heading straight to your wallet.`)}
      ${infoBox(`✅ <strong>${amount}</strong> is on its way to your wallet.`, accent.glow)}
      ${dataRows([["💵 Amount:", hl(amount, accent)], ["🔗 Transaction:", txHash], ["⏳ Status:", "PROCESSING"]], accent)}
      ${infoBox("⏱️ Funds usually land within a few minutes. Track it on-chain with the hash above.", "#00D4FF")}
      ${p("Thanks for playing at DGC Arcade. 🎮")}
    `;
    return {
      subject: `🚀 Withdrawal Processed — ${amount} • DGC Arcade`,
      html: shell({ accentName: "gold", header: iconHeader(LOGOS.dGoldSpace, accent, "Cashout"), body, preheader: `${amount} is on the way to your wallet.` }),
    };
  },
  // V2 — Ocean, "money's moving"
  (username, amount, txHash) => {
    const accent = ACCENTS.ocean;
    const body = `
      ${h("Cashout Sent 🌊", accent)}
      ${p(`${hl(username, accent)}, you pulled it off — your withdrawal is broadcasting to the network right now.`)}
      ${dataRows([["💸 Sending:", hl(amount, accent)], ["🔗 Tx hash:", txHash], ["🌊 Status:", "BROADCASTING"]], accent)}
      ${infoBox("⏱️ Most withdrawals settle in minutes depending on network traffic.", accent.glow)}
      ${btn(`${SITE_URL}/dashboard`, "View Dashboard", accent)}
    `;
    return {
      subject: `🌊 Cashout Sent — ${amount} on the way • DGC Arcade`,
      html: shell({ accentName: "ocean", header: iconHeader(LOGOS.dOcean, accent, "Withdrawal"), body, preheader: `${amount} is broadcasting now.` }),
    };
  },
  // V3 — Cyber, "payout confirmed"
  (username, amount, txHash) => {
    const accent = ACCENTS.cyber;
    const body = `
      ${h("Payout Confirmed ⚡", accent)}
      ${p(`Clean exit, ${hl(username, accent)}. Your withdrawal is processed and signed off.`)}
      ${dataRows([["💵 Amount:", hl(amount, accent)], ["🔗 Transaction:", txHash], ["🟢 Status:", "PROCESSING"]], accent)}
      ${infoBox("💡 Instant payouts, no BS. Track the transaction anytime with the hash above.", accent.glow)}
      ${p("Come back and run it up again. 🎰")}
    `;
    return {
      subject: `⚡ Payout Confirmed — ${amount} • DGC Arcade`,
      html: shell({ accentName: "cyber", header: iconHeader(LOGOS.dCyber, accent, "Payout"), body, preheader: `${amount} payout processed.` }),
    };
  },
];

export async function sendWithdrawalEmail(
  email: string,
  username: string,
  amount: string,
  txHash: string
): Promise<void> {
  const { subject, html } = withdrawalVariants[pick(withdrawalVariants.length)](username, amount, txHash);
  await resend.emails.send({ from: SENDER_EMAIL, to: email, subject, html });
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ 6. PASSWORD RESET — 3 variations                                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const passwordResetVariants: Array<
  (username: string, resetLink: string) => { subject: string; html: string }
> = [
  // V1 — Gold, urgent but helpful
  (username, resetLink) => {
    const accent = ACCENTS.gold;
    const body = `
      ${h("Reset Your Password 🔑", accent)}
      ${p(`Yo ${hl(username, accent)}, we got a request to reset your DGC Arcade password. Tap below to set a new one.`)}
      ${infoBox("🔒 This link expires in 1 hour. Didn't request it? Just ignore this email — your password stays the same.", "#FF6B6B")}
      ${btn(resetLink, "Reset Password Now", accent)}
      ${p("<strong>Or copy this link:</strong>")}
      <div style="word-break:break-all; font-size:12px; color:#9aa0ad; background:${hexA(accent.glow, 0.06)}; padding:12px; border-radius:6px;">${resetLink}</div>
      ${infoBox("💡 For your security, never share this link with anyone.", "#00D4FF")}
    `;
    return {
      subject: "🔑 Password Reset — DGC Arcade",
      html: shell({ accentName: "gold", header: iconHeader(LOGOS.dGold, accent, "Password Reset"), body, preheader: "Reset your password — link valid for 1 hour." }),
    };
  },
  // V2 — Volcanic, "lock back in"
  (username, resetLink) => {
    const accent = ACCENTS.volcanic;
    const body = `
      ${h("Let's get you back in 🔥", accent)}
      ${p(`${hl(username, accent)}, forgot your password? Happens to the best. Hit the button and you'll be back on the floor in seconds.`)}
      ${btn(resetLink, "Set a New Password", accent)}
      ${infoBox("⏱️ This reset link self-destructs in 60 minutes for your safety.", accent.glow)}
      ${p("<strong>Button not working? Paste this:</strong>")}
      <div style="word-break:break-all; font-size:12px; color:#9aa0ad; background:${hexA(accent.glow, 0.06)}; padding:12px; border-radius:6px;">${resetLink}</div>
      ${infoBox("🔒 Didn't ask for this? Ignore it and your account stays locked down tight.", "#FF6B6B")}
    `;
    return {
      subject: `🔥 Reset your password, ${username} — DGC Arcade`,
      html: shell({ accentName: "volcanic", header: iconHeader(LOGOS.dVolcanic, accent, "Reset Access"), body, preheader: "Back on the floor in seconds — reset inside." }),
    };
  },
  // V3 — Purple, secure & clean
  (username, resetLink) => {
    const accent = ACCENTS.purple;
    const body = `
      ${h("Password Reset Request", accent)}
      ${p(`A password reset was requested for ${hl(username, accent)}. If that was you, set your new password below.`)}
      ${btn(resetLink, "Create New Password", accent)}
      ${dataRows([["⏱️ Link expires:", "60 minutes"], ["🔐 Single use:", "Yes"]], accent)}
      ${p("<strong>Manual link:</strong>")}
      <div style="word-break:break-all; font-size:12px; color:#9aa0ad; background:${hexA(accent.glow, 0.06)}; padding:12px; border-radius:6px;">${resetLink}</div>
      ${infoBox("🛡️ If you didn't request this, no action is needed — your current password still works.", "#FF6B6B")}
    `;
    return {
      subject: "🔐 Password Reset Request — DGC Arcade",
      html: shell({ accentName: "purple", header: iconHeader(LOGOS.dFuturistic, accent, "Reset Password"), body, preheader: "Set a new password — link valid 60 minutes." }),
    };
  },
];

export async function sendPasswordResetEmail(
  email: string,
  username: string,
  resetLink: string
): Promise<void> {
  const { subject, html } = passwordResetVariants[pick(passwordResetVariants.length)](username, resetLink);
  await resend.emails.send({ from: SENDER_EMAIL, to: email, subject, html });
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ 7. SUSPICIOUS ACTIVITY — 3 variations                                     ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const suspiciousVariants: Array<
  (username: string, activity: string, secureLink: string) => { subject: string; html: string }
> = [
  // V1 — Blood, urgent
  (username, activity, secureLink) => {
    const accent = ACCENTS.blood;
    const body = `
      ${h("Suspicious Activity Detected 🚨", accent)}
      ${p(`Yo ${hl(username, accent)}, we flagged something off on your account and locked things down as a precaution.`)}
      ${dataRows([["⚠️ Activity:", activity], ["⏰ Time:", new Date().toLocaleString()]], accent)}
      ${btn(secureLink, "Secure My Account Now", accent)}
      ${infoBox("🚨 URGENT: If this wasn't you, secure your account immediately. We'll reset your password and lock everything down.", accent.glow)}
    `;
    return {
      subject: "🚨 Security Alert — Action Needed • DGC Arcade",
      html: shell({ accentName: "blood", header: iconHeader(LOGOS.dBlood, accent, "Security Alert"), body, preheader: "We flagged suspicious activity on your account." }),
    };
  },
  // V2 — Volcanic, "we caught something"
  (username, activity, secureLink) => {
    const accent = ACCENTS.volcanic;
    const body = `
      ${h("We Caught Something 🔥", accent)}
      ${p(`${hl(username, accent)}, our system spotted unusual activity and stepped in to protect your bag.`)}
      ${dataRows([["⚠️ What we saw:", activity], ["🕒 When:", new Date().toLocaleString()], ["🛡️ Action:", "Account flagged"]], accent)}
      ${p("If this was you, confirm and clear the flag. If it wasn't, lock it down right now.")}
      ${btn(secureLink, "Review &amp; Secure", accent)}
      ${infoBox("🔒 Your funds are safe. We never move money without your confirmation.", accent.glow)}
    `;
    return {
      subject: `🔥 Unusual activity on your account, ${username} — DGC Arcade`,
      html: shell({ accentName: "volcanic", header: iconHeader(LOGOS.dVolcanic, accent, "Account Flagged"), body, preheader: "Unusual activity detected — please review." }),
    };
  },
  // V3 — Purple, surveillance/clean
  (username, activity, secureLink) => {
    const accent = ACCENTS.purple;
    const body = `
      ${h("Security Notice", accent)}
      ${p(`Our monitoring flagged activity on ${hl(username, accent)} that doesn't match your usual pattern.`)}
      ${dataRows([["⚠️ Event:", activity], ["⏱️ Detected:", new Date().toLocaleString()], ["🔐 Status:", "Awaiting your review"]], accent)}
      ${btn(secureLink, "Secure My Account", accent)}
      ${infoBox("🛡️ Recognize it? Confirm to clear the flag. Don't? We'll help you reset and re-lock everything.", "#FF6B6B")}
    `;
    return {
      subject: "🔐 Security Notice — Review Your DGC Arcade Account",
      html: shell({ accentName: "purple", header: iconHeader(LOGOS.dFuturistic, accent, "Security Notice"), body, preheader: "Activity flagged for your review." }),
    };
  },
];

export async function sendSuspiciousActivityEmail(
  email: string,
  username: string,
  activity: string,
  secureLink: string
): Promise<void> {
  const { subject, html } = suspiciousVariants[pick(suspiciousVariants.length)](username, activity, secureLink);
  await resend.emails.send({ from: SENDER_EMAIL, to: email, subject, html });
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ TEST EMAIL DISPATCHER (admin panel) — unchanged interface                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝

export async function sendTestEmail(
  email: string,
  emailType: string,
  testUsername: string = "TestUser",
  siteUrl: string = SITE_URL
): Promise<void> {
  const testToken = "test-reset-token-" + Date.now();

  switch (emailType) {
    case "welcome":
      await sendWelcomeEmail(email, testUsername, "player");
      break;
    case "verification":
      await sendEmailVerificationEmail(email, testUsername, generateVerificationCode());
      break;
    case "login-security":
      await sendLoginSecurityEmail(
        email,
        testUsername,
        "203.0.113.42",
        "Moscow, Russia",
        "Firefox on Windows"
      );
      break;
    case "deposit":
      await sendDepositEmail(email, testUsername, "0.5 BTC", "0x1234567890abcdef");
      break;
    case "withdrawal":
      await sendWithdrawalEmail(email, testUsername, "0.25 BTC", "0xabcdef1234567890");
      break;
    case "password-reset":
      await sendPasswordResetEmail(
        email,
        testUsername,
        `${siteUrl}/reset-password?token=${testToken}`
      );
      break;
    case "suspicious":
      await sendSuspiciousActivityEmail(
        email,
        testUsername,
        "Multiple failed login attempts from Moscow, Russia (Firefox on Windows)",
        `${siteUrl}/security`
      );
      break;
    default:
      throw new Error(`Unknown email type: ${emailType}`);
  }
}
