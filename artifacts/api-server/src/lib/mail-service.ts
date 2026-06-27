import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const SENDER_EMAIL = process.env.SENDER_EMAIL || "noreply@differentgrindcrew.com";
const SITE_URL = process.env.SITE_URL || "https://differentgrindcrew.com";

// Generate a clean, readable verification code (6 characters)
function generateVerificationCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Base email wrapper with DGC ARCADE wordmark logo
function createBaseEmailTemplate(content: string): string {
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
      width: 280px;
      height: 100px;
      margin: 0 auto 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: glow-shift 6s ease-in-out infinite;
    }
    .logo-img {
      max-width: 100%;
      height: auto;
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
    .info-box {
      background: rgba(0, 212, 255, 0.1);
      border-left: 4px solid #00D4FF;
      padding: 15px;
      border-radius: 4px;
      font-size: 13px;
      color: #b3e5ff;
      margin: 20px 0;
    }
    .success-box {
      background: rgba(0, 255, 135, 0.1);
      border-left: 4px solid #00FF87;
      padding: 15px;
      border-radius: 4px;
      font-size: 13px;
      color: #b3ffcc;
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
    .social-links {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid rgba(255, 215, 0, 0.2);
      display: flex;
      justify-content: center;
      gap: 20px;
      font-size: 12px;
    }
    .social-link {
      color: #FFD700;
      text-decoration: none;
    }
    ul { 
      margin: 15px 0; 
      padding-left: 20px; 
    }
    li { 
      margin: 8px 0; 
      color: #d0d0d0; 
    }
    h2 {
      font-size: 20px;
      color: #FFD700;
      margin: 20px 0 10px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-container">
        <svg class="logo-img" viewBox="0 0 2560 1440" width="280" height="100" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="dgcGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:#FFE55C;stop-opacity:1" />
              <stop offset="50%" style="stop-color:#FFD700;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#CC9900;stop-opacity:1" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <text x="1280" y="520" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="480" fill="url(#dgcGradient)" text-anchor="middle" filter="url(#glow)">DGC</text>
          <text x="1280" y="1000" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="280" fill="url(#dgcGradient)" text-anchor="middle" filter="url(#glow)">ARCADE</text>
        </svg>
      </div>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <div class="tagline">THE STREETS ALWAYS WIN</div>
      <div class="footer-text">© 2026 DGC Arcade. All rights reserved.</div>
      <div class="footer-text">Provably Fair • Instant Payouts • No BS</div>
      <div class="social-links">
        <a href="https://instagram.com/DGCARCADE" class="social-link">📸 Instagram</a>
        <a href="https://x.com/DGCARCADE" class="social-link">𝕏 X</a>
        <a href="https://t.me/DGCARCADE" class="social-link">✈️ Telegram</a>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

// WELCOME EMAIL - Friendly & Welcoming
export async function sendWelcomeEmail(
  email: string,
  username: string,
  userType: string
): Promise<void> {
  const content = `
    <p class="subtitle">🎮 Yo <span class="highlight">@${username}</span>! Welcome to the Elite</p>
    
    <p>You just joined DGC Arcade as a <strong>${userType.toUpperCase()}</strong>. Time to get paid or get played.</p>
    
    <div class="success-box">
      ✅ Your account is live and ready to roll
    </div>
    
    <h2>What You Can Do Now:</h2>
    <ul>
      <li>🎰 Play provably fair games (Blackjack, Mines, Coin Flip)</li>
      <li>💰 Deposit & withdraw real crypto instantly</li>
      <li>🔐 Your funds, your keys, your control</li>
      <li>⚡ No KYC bullshit. Just play.</li>
      <li>📊 Track your stats in real-time</li>
    </ul>
    
    <div class="divider"></div>
    
    <p class="subtitle">Ready to test your luck?</p>
    <p><a href="${SITE_URL}/dashboard" class="button">Go to Dashboard</a></p>
    
    <div class="info-box">
      💡 Pro tip: Verify your email to unlock all features and enable withdrawals.
    </div>
  `;
  
  const html = createBaseEmailTemplate(content);
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: "Welcome to DGC Arcade - The Streets Always Win 🎰",
    html,
  });
}

// EMAIL VERIFICATION - Clear & Actionable
export async function sendEmailVerificationEmail(
  email: string,
  username: string,
  code: string
): Promise<void> {
  const content = `
    <p class="subtitle">🔐 Verify Your Email</p>
    
    <p>Yo <span class="highlight">${username}</span>, confirm your email to unlock all DGC Arcade features.</p>
    
    <div class="code-box">
      <div class="code-label">Your 6-Character Code</div>
      <div class="code">${code}</div>
      <div class="code-expires">⏱️ Expires in 24 hours</div>
    </div>
    
    <h2>Two Ways to Verify:</h2>
    
    <p><strong>Option 1: Enter the code</strong></p>
    <p>Go to your account settings and paste the code above.</p>
    
    <p><strong>Option 2: Click the link</strong></p>
    <p><a href="${SITE_URL}/verify/${code}" class="button">Verify Email Now</a></p>
    
    <div class="security-note">
      🔒 <strong>Security:</strong> Never share this code. We'll never ask for it via email or support.
    </div>
  `;
  
  const html = createBaseEmailTemplate(content);
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: "Verify Your Email - DGC Arcade",
    html,
  });
}

// LOGIN SECURITY - Alert & Protective
export async function sendLoginSecurityEmail(
  email: string,
  username: string,
  ipAddress: string,
  location: string,
  device: string
): Promise<void> {
  const content = `
    <p class="subtitle">🚨 New Login Detected</p>
    
    <p>Yo <span class="highlight">${username}</span>, we spotted a new login on your account.</p>
    
    <div class="code-box">
      <div style="text-align: left; font-size: 14px; line-height: 1.8;">
        <div><strong>🌍 Location:</strong> ${location}</div>
        <div><strong>🔗 IP Address:</strong> ${ipAddress}</div>
        <div><strong>💻 Device:</strong> ${device}</div>
        <div><strong>⏰ Time:</strong> ${new Date().toLocaleString()}</div>
      </div>
    </div>
    
    <h2>Was This You?</h2>
    
    <p>
      <a href="${SITE_URL}/security/confirm" class="button">Yes, That Was Me</a>
      <a href="${SITE_URL}/security/suspicious" class="button button-secondary">No, That Wasn't Me</a>
    </p>
    
    <div class="security-note">
      🔒 If this wasn't you, click "No" immediately. We'll help you secure your account and reset your password.
    </div>
  `;
  
  const html = createBaseEmailTemplate(content);
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: "🚨 New Login Alert - DGC Arcade",
    html,
  });
}

// DEPOSIT CONFIRMATION - Celebratory & Positive
export async function sendDepositEmail(
  email: string,
  username: string,
  amount: string,
  txHash: string
): Promise<void> {
  const content = `
    <p class="subtitle">💰 Deposit Confirmed!</p>
    
    <p>Yo <span class="highlight">${username}</span>, your deposit is locked in and ready to play.</p>
    
    <div class="success-box">
      ✅ <strong>${amount}</strong> has been added to your balance
    </div>
    
    <div class="code-box">
      <div style="text-align: left; font-size: 14px; line-height: 1.8;">
        <div><strong>💵 Amount:</strong> <span class="highlight">${amount}</span></div>
        <div><strong>🔗 Transaction:</strong> ${txHash}</div>
        <div><strong>✅ Status:</strong> <span class="highlight">CONFIRMED</span></div>
      </div>
    </div>
    
    <p class="subtitle">Time to get paid or get played 🎰</p>
    
    <p><a href="${SITE_URL}/games" class="button">Start Playing Now</a></p>
    
    <div class="info-box">
      💡 Your balance is live. Play smart, win big.
    </div>
  `;
  
  const html = createBaseEmailTemplate(content);
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: "💰 Deposit Confirmed - DGC Arcade",
    html,
  });
}

// WITHDRAWAL CONFIRMATION - Professional & Reassuring
export async function sendWithdrawalEmail(
  email: string,
  username: string,
  amount: string,
  txHash: string
): Promise<void> {
  const content = `
    <p class="subtitle">🚀 Withdrawal Processed!</p>
    
    <p>Yo <span class="highlight">${username}</span>, your withdrawal is on the way to your wallet.</p>
    
    <div class="success-box">
      ✅ <strong>${amount}</strong> is being sent to your wallet
    </div>
    
    <div class="code-box">
      <div style="text-align: left; font-size: 14px; line-height: 1.8;">
        <div><strong>💵 Amount:</strong> <span class="highlight">${amount}</span></div>
        <div><strong>🔗 Transaction:</strong> ${txHash}</div>
        <div><strong>⏳ Status:</strong> <span class="highlight">PROCESSING</span></div>
      </div>
    </div>
    
    <div class="info-box">
      ⏱️ Your funds should arrive in your wallet within a few minutes. You can track the transaction on the blockchain using the hash above.
    </div>
    
    <p class="subtitle">Thanks for playing at DGC Arcade 🎮</p>
  `;
  
  const html = createBaseEmailTemplate(content);
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: "🚀 Withdrawal Processed - DGC Arcade",
    html,
  });
}

// PASSWORD RESET - Urgent but Helpful
export async function sendPasswordResetEmail(
  email: string,
  username: string,
  resetLink: string
): Promise<void> {
  const content = `
    <p class="subtitle">🔑 Reset Your Password</p>
    
    <p>Yo <span class="highlight">${username}</span>, we received a request to reset your password.</p>
    
    <div class="security-note">
      🔒 <strong>This link expires in 1 hour.</strong> If you didn't request this, ignore this email.
    </div>
    
    <p><a href="${resetLink}" class="button">Reset Password Now</a></p>
    
    <p><strong>Or copy this link:</strong></p>
    <p style="word-break: break-all; font-size: 12px; color: #888; background: rgba(255,215,0,0.05); padding: 10px; border-radius: 4px;">${resetLink}</p>
    
    <div class="info-box">
      💡 For security, never share this link with anyone.
    </div>
  `;
  
  const html = createBaseEmailTemplate(content);
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: "🔑 Password Reset - DGC Arcade",
    html,
  });
}

// SUSPICIOUS ACTIVITY - Urgent & Action-Oriented
export async function sendSuspiciousActivityEmail(
  email: string,
  username: string,
  activity: string,
  secureLink: string
): Promise<void> {
  const content = `
    <p class="subtitle">🚨 Suspicious Activity Detected</p>
    
    <p>Yo <span class="highlight">${username}</span>, we detected suspicious activity on your account.</p>
    
    <div class="code-box">
      <div style="text-align: left; font-size: 14px; line-height: 1.8;">
        <div><strong>⚠️ Activity:</strong> ${activity}</div>
        <div><strong>⏰ Time:</strong> ${new Date().toLocaleString()}</div>
      </div>
    </div>
    
    <p class="subtitle">Act Now to Secure Your Account</p>
    
    <p><a href="${secureLink}" class="button">Secure My Account</a></p>
    
    <div class="security-note">
      🚨 <strong>URGENT:</strong> If this wasn't you, click the button above immediately. We'll help you reset your password and lock down your account.
    </div>
  `;
  
  const html = createBaseEmailTemplate(content);
  
  await resend.emails.send({
    from: SENDER_EMAIL,
    to: email,
    subject: "🚨 Security Alert - DGC Arcade",
    html,
  });
}

// TEST EMAIL - For admin testing
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
      await sendEmailVerificationEmail(email, testUsername, "ABC123");
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
