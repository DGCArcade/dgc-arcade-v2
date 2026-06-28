// Renders all 21 DGC Arcade email variations to standalone HTML files for preview.
// It re-implements the variant dispatch by calling each category function many
// times until all 3 variants are captured (variants are chosen at random).
//
// To make logos visible in local preview, asset URLs are rewritten to local file paths.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../email-previews");
const ASSET_DIR = path.resolve(__dirname, "../artifacts/dgc-arcade/public/email-assets");
fs.mkdirSync(OUT, { recursive: true });

// Point asset base at the local folder so previews show real logos.
process.env.EMAIL_ASSET_BASE = pathToFileURL(ASSET_DIR).href;
process.env.SITE_URL = "https://differentgrindcrew.com";
process.env.RESEND_API_KEY = "preview-no-send";

// We need the internal variant arrays + shell. Easiest: transpile the TS on the
// fly is overkill — instead we import a JS mirror exported for preview. To avoid
// duplicating logic, we read the compiled approach: import via tsx is unavailable,
// so we capture rendered HTML by stubbing resend and calling exported senders.

// Stub: intercept resend send to capture html instead of sending.
globalThis.__captured = [];

// Dynamically import the TS source through a tiny loader using esbuild (already a dep).
import { build } from "../node_modules/.pnpm/esbuild@0.27.3/node_modules/esbuild/lib/main.js";

const entry = path.resolve(__dirname, "../artifacts/api-server/src/lib/mail-service.ts");
const bundlePath = path.resolve(OUT, "_mail-bundle.mjs");

// Build a bundle but replace the "resend" import with a stub module.
const stubResend = path.resolve(OUT, "_resend-stub.mjs");
fs.writeFileSync(
  stubResend,
  `export class Resend {
     constructor(){}
     emails = { send: async (opts) => { globalThis.__captured.push(opts); return { id: 'preview' }; } };
   }`
);

await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundlePath,
  plugins: [
    {
      name: "stub-resend",
      setup(b) {
        b.onResolve({ filter: /^resend$/ }, () => ({ path: stubResend }));
      },
    },
  ],
});

const mod = await import(pathToFileURL(bundlePath).href);

// Categories: senderFn + args + how many distinct variants + label
const cats = [
  { key: "welcome", fn: () => mod.sendWelcomeEmail("preview@dgc.com", "Skip", "player"), n: 3 },
  { key: "verification", fn: () => mod.sendEmailVerificationEmail("preview@dgc.com", "Skip", "A1B2C3"), n: 3 },
  { key: "login-security", fn: () => mod.sendLoginSecurityEmail("preview@dgc.com", "Skip", "203.0.113.42", "Atlanta, GA, USA", "Chrome on iPhone"), n: 3 },
  { key: "deposit", fn: () => mod.sendDepositEmail("preview@dgc.com", "Skip", "0.75 BTC", "0x9f3a...c21d"), n: 3 },
  { key: "withdrawal", fn: () => mod.sendWithdrawalEmail("preview@dgc.com", "Skip", "1.20 ETH", "0x77be...90af"), n: 3 },
  { key: "password-reset", fn: () => mod.sendPasswordResetEmail("preview@dgc.com", "Skip", "https://differentgrindcrew.com/reset-password?token=abc123xyz"), n: 3 },
  { key: "suspicious", fn: () => mod.sendSuspiciousActivityEmail("preview@dgc.com", "Skip", "5 failed logins from Moscow, Russia", "https://differentgrindcrew.com/security"), n: 3 },
];

const seen = {};
for (const c of cats) {
  seen[c.key] = new Map();
  let tries = 0;
  while (seen[c.key].size < c.n && tries < 400) {
    tries++;
    globalThis.__captured = [];
    await c.fn();
    const { subject, html } = globalThis.__captured[0];
    if (!seen[c.key].has(subject)) {
      seen[c.key].set(subject, html);
    }
  }
  let i = 1;
  for (const [subject, html] of seen[c.key]) {
    const file = path.join(OUT, `${c.key}_v${i}.html`);
    fs.writeFileSync(file, html);
    console.log(`${c.key} v${i}  ::  ${subject}`);
    i++;
  }
  if (seen[c.key].size < c.n) {
    console.warn(`!! ${c.key}: only captured ${seen[c.key].size}/${c.n} distinct variants`);
  }
}

console.log("\nDONE. Previews in:", OUT);
