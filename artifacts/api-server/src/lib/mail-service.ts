import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const SENDER_EMAIL = process.env.SENDER_EMAIL || "noreply@differentgrindcrew.com";
const SITE_URL = process.env.SITE_URL || "https://differentgrindcrew.com";

// Generate a clean, readable verification code
function generateVerificationCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Professional email template wrapper
function createEmailTemplate(title: string, content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Space Grotesk', sans-serif; margin: 0; padding: 0; background: #0a0a0a; }
    .container { max-width: 600px; margin: 0 auto; background: #080c18; color: #ffffff; }
    .header { background: linear-gradient(135deg, #080c18 0%, #0f1428 100%); padding: 40px 20px; text-align: center; border-bottom: 2px solid #FFD700; }
    .logo { width: 80px; height: 80px; margin: 0 auto 20px; background: #080c18; border-radius: 16px; display: flex; align-items: center; justify-content: center; border: 2px solid #FFD700; box-shadow: 0 0 20px rgba(255, 215, 0, 0.3); }
    .logo-text { font-size: 48px; font-weight: 900; background: linear-gradient(135deg, #FFE55C 0%, #FFD700 60%, #CC9900 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .brand { font-size: 14px; color: #FFD700; letter-spacing: 2px; margin-bottom: 10px; font-weight: 600; }
    h1 { font-size: 28px; margin: 0; color: #ffffff; font-weight: 700; letter-spacing: 1px; }
    .content { padding: 40px 30px; }
    .subtitle { font-size: 16px; color: #b0b0b0; margin-bottom: 20px; line-height: 1.6; }
    .code-box { background: linear-gradient(135deg, #1a1f35 0%, #0f1428 100%); border: 2px solid #FFD700; border-radius: 12px; padding: 20px; margin: 30px 0; text-align: center; box-shadow: 0 0 20px rgba(255, 215, 0, 0.2); }
    .code { font-family: 'Space Mono', monospace; font-size: 32px; font-weight: 700; color: #FFD700; letter-spacing: 4px; margin: 10px 0; }
    .code-label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
    .code-expires { font-size: 12px; color: #FF6B6B; margin-top: 15px; }
    .button { display: inline-block; background: linear-gradient(135deg, #FFD700 0%, #FFC700 100%); color: #080c18; padding: 14px 40px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 16px; margin: 20px 0; border: none; cursor: pointer; box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3); transition: all 0.3s ease; }
    .button:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(255, 215, 0, 0.5); }
    .button-secondary { background: transparent; color: #FFD700; border: 2px solid #FFD700; }
    .button-secondary:hover { background: rgba(255, 215, 0, 0.1); }
    .divider { height: 1px; background: linear-gradient(90deg, transparent, #FFD700, transparent); margin: 30px 0; }
    .security-note { background: rgba(255, 107, 107, 0.1); border-left: 4px solid #FF6B6B; padding: 15px; border-radius: 4px; font-size: 13px; color: #ffb3b3; margin: 20px 0; }
    .footer { padding: 30px 20px; text-align: center; border-top: 1px solid rgba(255, 215, 0, 0.2); background: #0a0a0a; }
    .footer-text { font-size: 12px; color: #666; margin: 5px 0; }
    .tagline { font-size: 14px; color: #FFD700; font-weight: 600; letter-spacing: 1px; margin-top: 20px; }
    .highlight { color: #FFD700; font-weight: 600; }
    ul { margin: 15px 0; padding-left: 20px; }
    li { margin: 8px 0; color: #d0d0d0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        <div class="logo-text">D</div>
      </div>
      <div class="brand">DGC ARCADE</div>
      <h1>${title}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <div class="tagline">🎰 THE STREETS ALWAYS WIN 🎰</div>
      <div class="footer-text">© 2026 DGC Arcade. All rights reserved.</div>
      <div class="footer-text">Provably Fair • Instant Payouts • Crypto Native</div>
    </div>
  </div>
</body>
</html>
  `;
}

// Welcome/Signup Email
export async function sendWelcomeEmail(email: string, username: string, userType: string): Promise<void> {
  const userTypeLabel = userType === "admin" ? "Administrator" : userType === "creator" ? "Creator" : "Player";
  
  const content = `
    <p class="subtitle">Welcome to the elite, <span class="highlight">${username}</span>!</p>
    
    <p>You've been set up as a <span class="highlight">${userTypeLabel}</span> on DGC Arcade. Here's what you can do:</p>
    
    <ul>
      <li><strong>Instant Payouts:</strong> Withdraw winnings to your wallet in seconds</li>
      <li><strong>Provably Fair:</strong> Every result is cryptographically verifiable</li>
      <li><strong>Crypto Native:</strong> Deposit and withdraw with Bitcoin, Ethereum, USDT, and more</li>
      <li><strong>Live Jackpots:</strong> Win big with our platform-wide jackpot pools</li>
    </ul>
    
    <p>Your account is ready to go. Log in and start playing!</p>
    
    <center>
      <a href="${SITE_URL}/login" class="button">Log In Now</a>
    </center>
  `;
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: `Welcome to DGC Arcade, ${username}!`,
    html: createEmailTemplate("Welcome to DGC Arcade", content),
  });
}

// Email Verification
export async function sendEmailVerificationEmail(email: string, username: string, code: string, verifyLink: string): Promise<void> {
  const content = `
    <p class="subtitle">Hi <span class="highlight">${username}</span>, verify your email to unlock all features.</p>
    
    <div class="code-box">
      <div class="code-label">Your Verification Code</div>
      <div class="code">${code}</div>
      <div class="code-expires">⏱️ Expires in 24 hours</div>
    </div>
    
    <p>Choose one of two ways to verify:</p>
    
    <p><strong>Option 1: Enter the code above</strong></p>
    <p>Go to your account settings and enter the code above when prompted.</p>
    
    <p><strong>Option 2: Click the verification link</strong></p>
    <center>
      <a href="${verifyLink}" class="button">Verify Email</a>
    </center>
    
    <div class="security-note">
      ⚠️ <strong>Security Tip:</strong> Never share this code with anyone. DGC Arcade staff will never ask for it.
    </div>
  `;
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: `Verify Your Email - DGC Arcade`,
    html: createEmailTemplate("Email Verification", content),
  });
}

// Login Security Alert
export async function sendLoginSecurityEmail(
  email: string,
  username: string,
  ip: string,
  location: string,
  device: string,
  suspiciousLink: string
): Promise<void> {
  const content = `
    <p class="subtitle">New login detected on your account.</p>
    
    <p>Your account was just accessed with these details:</p>
    
    <div class="code-box">
      <div style="text-align: left; font-size: 14px; line-height: 1.8;">
        <div>📍 <strong>Location:</strong> ${location}</div>
        <div>🌐 <strong>IP Address:</strong> ${ip}</div>
        <div>💻 <strong>Device:</strong> ${device}</div>
        <div>⏰ <strong>Time:</strong> ${new Date().toLocaleString()}</div>
      </div>
    </div>
    
    <p><strong>Was this you?</strong></p>
    
    <center>
      <a href="${SITE_URL}/login" class="button">Yes, This Was Me</a>
      <a href="${suspiciousLink}" class="button button-secondary">No, Secure My Account</a>
    </center>
    
    <div class="security-note">
      ⚠️ If you didn't recognize this login, click "No, Secure My Account" immediately to reset your password.
    </div>
  `;
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: `Security Alert: New Login - DGC Arcade`,
    html: createEmailTemplate("Login Security Alert", content),
  });
}

// Deposit Confirmation
export async function sendDepositConfirmationEmail(
  email: string,
  username: string,
  amount: string,
  currency: string,
  txHash: string
): Promise<void> {
  const content = `
    <p class="subtitle">Your deposit has been confirmed!</p>
    
    <div class="code-box">
      <div style="text-align: left; font-size: 14px; line-height: 2;">
        <div>💰 <strong>Amount:</strong> ${amount} ${currency}</div>
        <div>✅ <strong>Status:</strong> <span style="color: #00FF87;">CONFIRMED</span></div>
        <div>🔗 <strong>Transaction:</strong> <code style="color: #FFD700; font-size: 12px;">${txHash.substring(0, 20)}...</code></div>
        <div>⏰ <strong>Time:</strong> ${new Date().toLocaleString()}</div>
      </div>
    </div>
    
    <p>Your balance has been updated. You can now play and withdraw your winnings instantly!</p>
    
    <center>
      <a href="${SITE_URL}/play" class="button">Start Playing</a>
    </center>
  `;
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: `Deposit Confirmed - ${amount} ${currency}`,
    html: createEmailTemplate("Deposit Confirmed", content),
  });
}

// Withdrawal Confirmation
export async function sendWithdrawalConfirmationEmail(
  email: string,
  username: string,
  amount: string,
  currency: string,
  address: string
): Promise<void> {
  const content = `
    <p class="subtitle">Your withdrawal is being processed!</p>
    
    <div class="code-box">
      <div style="text-align: left; font-size: 14px; line-height: 2;">
        <div>💸 <strong>Amount:</strong> ${amount} ${currency}</div>
        <div>📤 <strong>Status:</strong> <span style="color: #FFD700;">PROCESSING</span></div>
        <div>🏦 <strong>To Address:</strong> <code style="color: #88EEFF; font-size: 12px;">${address.substring(0, 20)}...</code></div>
        <div>⏰ <strong>Time:</strong> ${new Date().toLocaleString()}</div>
      </div>
    </div>
    
    <p>Your withdrawal is being processed. Most transactions confirm on-chain within 10 minutes.</p>
    
    <p>You'll receive another email once the transaction is confirmed on the blockchain.</p>
    
    <center>
      <a href="${SITE_URL}/transactions" class="button">View Transaction</a>
    </center>
  `;
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: `Withdrawal Initiated - ${amount} ${currency}`,
    html: createEmailTemplate("Withdrawal Processing", content),
  });
}

// Password Reset
export async function sendPasswordResetEmail(email: string, username: string, resetLink: string): Promise<void> {
  const content = `
    <p class="subtitle">Reset your password</p>
    
    <p>We received a request to reset your password. Click the button below to set a new password:</p>
    
    <center>
      <a href="${resetLink}" class="button">Reset Password</a>
    </center>
    
    <p>This link expires in <span class="highlight">1 hour</span>.</p>
    
    <div class="security-note">
      ⚠️ If you didn't request this, ignore this email. Your account is safe.
    </div>
  `;
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: `Reset Your Password - DGC Arcade`,
    html: createEmailTemplate("Password Reset", content),
  });
}

// Suspicious Activity Alert
export async function sendSuspiciousActivityEmail(
  email: string,
  username: string,
  activity: string,
  secureLink: string
): Promise<void> {
  const content = `
    <p class="subtitle">Suspicious activity detected on your account</p>
    
    <p>We detected unusual activity:</p>
    
    <div class="code-box">
      <div style="text-align: left; font-size: 14px;">
        <strong>Activity:</strong> ${activity}
      </div>
    </div>
    
    <p>If this wasn't you, secure your account immediately:</p>
    
    <center>
      <a href="${secureLink}" class="button">Secure My Account</a>
    </center>
    
    <div class="security-note">
      ⚠️ <strong>URGENT:</strong> Click the button above to reset your password and secure your account.
    </div>
  `;
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: `Security Alert: Suspicious Activity - DGC Arcade`,
    html: createEmailTemplate("Suspicious Activity Alert", content),
  });
}

// Test Email (all types)
export async function sendTestEmail(email: string, emailType: string): Promise<void> {
  const testUsername = "TestUser";
  
  switch (emailType) {
    case "welcome":
      await sendWelcomeEmail(email, testUsername, "player");
      break;
    case "verification":
      await sendEmailVerificationEmail(email, testUsername, "ABC12345", `${SITE_URL}/verify?code=ABC12345`);
      break;
    case "login-security":
      await sendLoginSecurityEmail(email, testUsername, "192.168.1.1", "San Francisco, CA", "Chrome on macOS", `${SITE_URL}/security`);
      break;
    case "deposit":
      await sendDepositConfirmationEmail(email, testUsername, "0.5", "BTC", "0x1234567890abcdef");
      break;
    case "withdrawal":
      await sendWithdrawalConfirmationEmail(email, testUsername, "0.5", "BTC", "1A1z7agoat4oPLx2weKU81meWTCC61seNm");
      break;
    case "password-reset":
      await sendPasswordResetEmail(email, testUsername, `${SITE_URL}/reset-password?token=test123`);
      break;
    case "suspicious":
      await sendSuspiciousActivityEmail(email, testUsername, "Multiple failed login attempts", `${SITE_URL}/security`);
      break;
    default:
      throw new Error(`Unknown email type: ${emailType}`);
  }
}
