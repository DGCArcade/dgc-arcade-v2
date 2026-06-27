import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const SENDER_EMAIL = process.env.SENDER_EMAIL || "noreply@differentgrindcrew.com";
const SITE_URL = process.env.SITE_URL || "https://differentgrindcrew.com";

// Generate a clean, readable verification code
function generateVerificationCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Professional email template wrapper with animated glow
function createEmailTemplate(title: string, content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @keyframes glow-shift {
      0% { box-shadow: 0 0 20px rgba(255, 215, 0, 0.4), 0 0 40px rgba(255, 215, 0, 0.2); }
      25% { box-shadow: 0 0 20px rgba(255, 136, 0, 0.4), 0 0 40px rgba(255, 136, 0, 0.2); }
      50% { box-shadow: 0 0 20px rgba(255, 107, 107, 0.4), 0 0 40px rgba(255, 107, 107, 0.2); }
      75% { box-shadow: 0 0 20px rgba(180, 79, 255, 0.4), 0 0 40px rgba(180, 79, 255, 0.2); }
      100% { box-shadow: 0 0 20px rgba(255, 215, 0, 0.4), 0 0 40px rgba(255, 215, 0, 0.2); }
    }
    
    @keyframes text-glow {
      0% { color: #FFD700; text-shadow: 0 0 10px rgba(255, 215, 0, 0.6); }
      25% { color: #FF8800; text-shadow: 0 0 10px rgba(255, 136, 0, 0.6); }
      50% { color: #FF6B6B; text-shadow: 0 0 10px rgba(255, 107, 107, 0.6); }
      75% { color: #B44FFF; text-shadow: 0 0 10px rgba(180, 79, 255, 0.6); }
      100% { color: #FFD700; text-shadow: 0 0 10px rgba(255, 215, 0, 0.6); }
    }

    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Space Grotesk', sans-serif; 
      margin: 0; 
      padding: 0; 
      background: #0a0a0a; 
    }
    .container { 
      max-width: 600px; 
      margin: 0 auto; 
      background: #080c18; 
      color: #ffffff; 
    }
    .header { 
      background: linear-gradient(135deg, #080c18 0%, #0f1428 100%); 
      padding: 40px 20px; 
      text-align: center; 
      border-bottom: 2px solid #FFD700; 
    }
    .logo-container {
      width: 100px;
      height: 100px;
      margin: 0 auto 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: glow-shift 6s ease-in-out infinite;
      border-radius: 20px;
    }
    .logo-svg {
      width: 100%;
      height: 100%;
    }
    .brand { 
      font-size: 14px; 
      color: #FFD700; 
      letter-spacing: 2px; 
      margin-bottom: 10px; 
      font-weight: 600; 
    }
    h1 { 
      font-size: 28px; 
      margin: 0; 
      color: #ffffff; 
      font-weight: 700; 
      letter-spacing: 1px; 
      animation: text-glow 6s ease-in-out infinite;
    }
    .content { 
      padding: 40px 30px; 
    }
    .subtitle { 
      font-size: 16px; 
      color: #d0d0d0; 
      margin-bottom: 20px; 
      line-height: 1.6; 
    }
    .code-box { 
      background: linear-gradient(135deg, #1a1f35 0%, #0f1428 100%); 
      border: 2px solid #FFD700; 
      border-radius: 12px; 
      padding: 25px; 
      margin: 30px 0; 
      text-align: center; 
      animation: glow-shift 6s ease-in-out infinite;
    }
    .code-label { 
      font-size: 12px; 
      color: #888; 
      text-transform: uppercase; 
      letter-spacing: 1px; 
      margin-bottom: 15px; 
    }
    .code { 
      font-family: 'Space Mono', 'Courier New', monospace; 
      font-size: 36px; 
      font-weight: 700; 
      color: #FFD700; 
      letter-spacing: 6px; 
      margin: 15px 0; 
      word-break: break-all;
      animation: text-glow 6s ease-in-out infinite;
    }
    .code-expires { 
      font-size: 12px; 
      color: #FF6B6B; 
      margin-top: 15px; 
    }
    .button { 
      display: inline-block; 
      background: linear-gradient(135deg, #FFD700 0%, #FFC700 100%); 
      color: #080c18; 
      padding: 14px 40px; 
      border-radius: 8px; 
      text-decoration: none; 
      font-weight: 700; 
      font-size: 16px; 
      margin: 20px 0; 
      border: none; 
      cursor: pointer; 
      box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3); 
      transition: all 0.3s ease; 
    }
    .button:hover { 
      transform: translateY(-2px); 
      box-shadow: 0 6px 20px rgba(255, 215, 0, 0.5); 
    }
    .button-secondary { 
      background: transparent; 
      color: #FFD700; 
      border: 2px solid #FFD700; 
    }
    .button-secondary:hover { 
      background: rgba(255, 215, 0, 0.1); 
    }
    .divider { 
      height: 1px; 
      background: linear-gradient(90deg, transparent, #FFD700, transparent); 
      margin: 30px 0; 
    }
    .security-note { 
      background: rgba(255, 107, 107, 0.1); 
      border-left: 4px solid #FF6B6B; 
      padding: 15px; 
      border-radius: 4px; 
      font-size: 13px; 
      color: #ffb3b3; 
      margin: 20px 0; 
    }
    .footer { 
      padding: 30px 20px; 
      text-align: center; 
      border-top: 1px solid rgba(255, 215, 0, 0.2); 
      background: #0a0a0a; 
    }
    .footer-text { 
      font-size: 12px; 
      color: #666; 
      margin: 5px 0; 
    }
    .tagline { 
      font-size: 14px; 
      color: #FFD700; 
      font-weight: 600; 
      letter-spacing: 1px; 
      margin-top: 20px; 
      animation: text-glow 6s ease-in-out infinite;
    }
    .highlight { 
      color: #FFD700; 
      font-weight: 600; 
    }
    ul { 
      margin: 15px 0; 
      padding-left: 20px; 
    }
    li { 
      margin: 8px 0; 
      color: #d0d0d0; 
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-container">
        <svg class="logo-svg" width="100" height="100" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="180" height="180" rx="32" fill="#080c18"/>
          <defs>
            <radialGradient id="glow" cx="50%" cy="45%" r="55%">
              <stop offset="0%" stop-color="#FFD700" stop-opacity="0.22"/>
              <stop offset="100%" stop-color="#FF8800" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="letterGrad" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stop-color="#FFE55C"/>
              <stop offset="60%" stop-color="#FFD700"/>
              <stop offset="100%" stop-color="#CC9900"/>
            </radialGradient>
          </defs>
          <rect width="180" height="180" rx="32" fill="url(#glow)"/>
          <text x="89" y="134" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="118" fill="url(#letterGrad)" text-anchor="middle">D</text>
          <rect x="1" y="1" width="178" height="88" rx="31" fill="white" fill-opacity="0.05"/>
          <rect x="1" y="1" width="178" height="178" rx="31" stroke="#FFD700" stroke-opacity="0.18" stroke-width="1.5" fill="none"/>
        </svg>
      </div>
      <div class="brand">DGC ARCADE</div>
      <h1>${title}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <div class="tagline">THE STREETS ALWAYS WIN</div>
      <div class="footer-text">© 2026 DGC Arcade. All rights reserved.</div>
      <div class="footer-text">Provably Fair • Instant Payouts • No BS</div>
      <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255, 215, 0, 0.2);">
        <div class="footer-text" style="margin-bottom: 10px;">Follow Us</div>
        <div style="display: flex; justify-content: center; gap: 20px; font-size: 12px;">
          <a href="https://instagram.com/DGCARCADE" style="color: #FFD700; text-decoration: none;">📸 Instagram</a>
          <a href="https://x.com/DGCARCADE" style="color: #FFD700; text-decoration: none;">𝕏 X</a>
          <a href="https://t.me/DGCARCADE" style="color: #FFD700; text-decoration: none;">✈️ Telegram</a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

export async function sendWelcomeEmail(
  email: string,
  username: string,
  userType: string
): Promise<void> {
  const content = `
    <p class="subtitle">Welcome to the elite, <span class="highlight">${username}</span>!</p>
    
    <p>You're now part of DGC Arcade. Here's what you can do:</p>
    
    <ul>
      <li><strong>Play Provably Fair Games</strong> - Blackjack, Mines, Coin Flip with instant payouts</li>
      <li><strong>Real Deposits & Withdrawals</strong> - Crypto payments, lightning fast</li>
      <li><strong>Track Your Stats</strong> - See your wins, losses, and earnings in real-time</li>
      <li><strong>Account Security</strong> - Email verification, 2FA, login alerts</li>
    </ul>
    
    <p>Your account type: <span class="highlight">${userType.toUpperCase()}</span></p>
    
    <div class="divider"></div>
    
    <p class="subtitle">Get Started Now</p>
    <p>Verify your email to unlock all features and start playing.</p>
  `;
  
  const html = createEmailTemplate("Welcome to DGC Arcade", content);
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: "Welcome to DGC Arcade - The Streets Always Win",
    html,
  });
}

export async function sendEmailVerificationEmail(
  email: string,
  username: string,
  code: string
): Promise<void> {
  const content = `
    <p class="subtitle">Verify your email to unlock all features</p>
    
    <p>Hi <span class="highlight">${username}</span>, confirm your email address to get started.</p>
    
    <div class="code-box">
      <div class="code-label">Your Verification Code</div>
      <div class="code">${code}</div>
      <div class="code-expires">⏱️ Expires in 24 hours</div>
    </div>
    
    <p><strong>Option 1: Enter the code above</strong></p>
    <p>Go to your account settings and enter the code above.</p>
    
    <p><strong>Option 2: Click the verification link</strong></p>
    <p><a href="${SITE_URL}/verify/${code}" class="button">Verify Email</a></p>
    
    <div class="security-note">
      💡 <strong>Tip:</strong> Never share this code with anyone. DGC Arcade support will never ask for it.
    </div>
  `;
  
  const html = createEmailTemplate("Verify Your Email", content);
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: "Verify Your Email - DGC Arcade",
    html,
  });
}

export async function sendLoginSecurityEmail(
  email: string,
  username: string,
  ipAddress: string,
  location: string,
  device: string
): Promise<void> {
  const content = `
    <p class="subtitle">New login detected</p>
    
    <p>Hi <span class="highlight">${username}</span>, we detected a new login to your account.</p>
    
    <div class="code-box">
      <div style="text-align: left; font-size: 14px; line-height: 1.8;">
        <div><strong>IP Address:</strong> ${ipAddress}</div>
        <div><strong>Location:</strong> ${location}</div>
        <div><strong>Device:</strong> ${device}</div>
        <div><strong>Time:</strong> ${new Date().toLocaleString()}</div>
      </div>
    </div>
    
    <p><strong>Was this you?</strong></p>
    
    <p>
      <a href="${SITE_URL}/security/confirm" class="button">Yes, This Was Me</a>
      <a href="${SITE_URL}/security/suspicious" class="button button-secondary">No, This Wasn't Me</a>
    </p>
    
    <div class="security-note">
      🔒 If this wasn't you, click "No" immediately to secure your account. We'll help you reset your password.
    </div>
  `;
  
  const html = createEmailTemplate("Login Security Alert", content);
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: "New Login - DGC Arcade Security Alert",
    html,
  });
}

export async function sendDepositEmail(
  email: string,
  username: string,
  amount: string,
  txHash: string
): Promise<void> {
  const content = `
    <p class="subtitle">Deposit confirmed!</p>
    
    <p>Hi <span class="highlight">${username}</span>, your deposit has been received and processed.</p>
    
    <div class="code-box">
      <div style="text-align: left; font-size: 14px; line-height: 1.8;">
        <div><strong>Amount:</strong> <span class="highlight">${amount}</span></div>
        <div><strong>Transaction:</strong> ${txHash}</div>
        <div><strong>Status:</strong> <span class="highlight">CONFIRMED</span></div>
      </div>
    </div>
    
    <p>Your balance has been updated. You're ready to play!</p>
    
    <p><a href="${SITE_URL}/games" class="button">Start Playing</a></p>
  `;
  
  const html = createEmailTemplate("Deposit Confirmed", content);
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: "Deposit Confirmed - DGC Arcade",
    html,
  });
}

export async function sendWithdrawalEmail(
  email: string,
  username: string,
  amount: string,
  txHash: string
): Promise<void> {
  const content = `
    <p class="subtitle">Withdrawal processed!</p>
    
    <p>Hi <span class="highlight">${username}</span>, your withdrawal has been sent to your wallet.</p>
    
    <div class="code-box">
      <div style="text-align: left; font-size: 14px; line-height: 1.8;">
        <div><strong>Amount:</strong> <span class="highlight">${amount}</span></div>
        <div><strong>Transaction:</strong> ${txHash}</div>
        <div><strong>Status:</strong> <span class="highlight">PROCESSING</span></div>
      </div>
    </div>
    
    <p>Your funds should arrive in your wallet within a few minutes.</p>
    
    <div class="security-note">
      💡 <strong>Tip:</strong> You can track your transaction on the blockchain using the transaction hash above.
    </div>
  `;
  
  const html = createEmailTemplate("Withdrawal Processed", content);
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: "Withdrawal Processed - DGC Arcade",
    html,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  username: string,
  resetLink: string
): Promise<void> {
  const content = `
    <p class="subtitle">Reset your password</p>
    
    <p>Hi <span class="highlight">${username}</span>, we received a request to reset your password.</p>
    
    <p><a href="${resetLink}" class="button">Reset Password</a></p>
    
    <p>Or copy this link:</p>
    <p style="word-break: break-all; font-size: 12px; color: #888;">${resetLink}</p>
    
    <div class="security-note">
      🔒 This link expires in 1 hour. If you didn't request this, ignore this email.
    </div>
  `;
  
  const html = createEmailTemplate("Reset Your Password", content);
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: "Password Reset - DGC Arcade",
    html,
  });
}

export async function sendSuspiciousActivityEmail(
  email: string,
  username: string,
  activity: string,
  secureLink: string
): Promise<void> {
  const content = `
    <p class="subtitle">Suspicious activity detected</p>
    
    <p>Hi <span class="highlight">${username}</span>, we detected suspicious activity on your account.</p>
    
    <div class="code-box">
      <div style="text-align: left; font-size: 14px; line-height: 1.8;">
        <div><strong>Activity:</strong> ${activity}</div>
        <div><strong>Time:</strong> ${new Date().toLocaleString()}</div>
      </div>
    </div>
    
    <p><a href="${secureLink}" class="button">Secure Your Account</a></p>
    
    <div class="security-note">
      🚨 <strong>URGENT:</strong> If this wasn't you, click the button above immediately. We'll help you reset your password and secure your account.
    </div>
  `;
  
  const html = createEmailTemplate("Security Alert", content);
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: "Security Alert - DGC Arcade",
    html,
  });
}

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
      await sendEmailVerificationEmail(email, testUsername, "ABC12345");
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
