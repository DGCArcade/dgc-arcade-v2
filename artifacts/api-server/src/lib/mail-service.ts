import { Resend } from "resend";

/**
 * Professional Mail Service for DGC Arcade
 * Configured for Resend for automated emails
 * Features: DGC branding, neon glow effects, "The Streets Always Win" tagline
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const SENDER_EMAIL = process.env.SENDER_EMAIL || "noreply@differentgrindcrew.com";
const SITE_URL = process.env.SITE_URL || "https://differentgrindcrew.com";

let resend: Resend | null = null;

function getResendClient(): Resend {
  if (resend) return resend;
  
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY environment variable is not set");
  }
  
  resend = new Resend(RESEND_API_KEY);
  return resend;
}

/**
 * Base email template with DGC branding, neon glow, and "The Streets Always Win" tagline
 */
function getEmailTemplate(content: string, title: string = "DGC Arcade") {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: Arial, Helvetica, sans-serif; 
          background-color: #0a0e1a; 
          color: #ffffff;
          line-height: 1.6;
          margin: 0;
          padding: 0;
        }
        
        .container { 
          max-width: 600px; 
          margin: 0 auto; 
          padding: 20px;
        }
        
        .email-wrapper {
          background: linear-gradient(135deg, #0f1420 0%, #1a1f2e 50%, #0f1420 100%);
          border: 1px solid rgba(255, 215, 0, 0.15);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 0 40px rgba(255, 215, 0, 0.08);
        }
        
        .header {
          background: linear-gradient(90deg, #FFD700, #FF8C00, #FF1493, #B44FFF, #00D4FF, #00FF87, #FFD700);
          background-size: 200% 200%;
          padding: 2px;
          position: relative;
        }
        
        .header-content {
          background: linear-gradient(135deg, #0f1420 0%, #1a1f2e 100%);
          padding: 40px 30px;
          text-align: center;
        }
        
        .logo-box {
          width: 60px;
          height: 60px;
          margin: 0 auto 15px;
          background: linear-gradient(135deg, #FFD700, #FF8C00);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 20px rgba(255, 215, 0, 0.4);
        }
        
        .logo-text {
          font-size: 36px;
          font-weight: 900;
          color: #0f1420;
          line-height: 1;
        }
        
        .logo-subtitle {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 3px;
          color: #FFD700;
          text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
          font-weight: 700;
          margin-top: 10px;
        }
        
        .title {
          font-size: 24px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-top: 20px;
          color: #FFD700;
          text-shadow: 0 0 10px rgba(255, 215, 0, 0.3);
        }
        
        .content {
          padding: 40px 30px;
          color: #ffffff;
          font-size: 15px;
          line-height: 1.8;
        }
        
        .content p {
          margin-bottom: 15px;
          color: #ffffff;
        }
        
        .content strong {
          color: #FFD700;
          font-weight: 700;
        }
        
        .content ul {
          margin-left: 20px;
          margin-bottom: 20px;
          color: #ffffff;
        }
        
        .content li {
          margin-bottom: 8px;
          color: #ffffff;
        }
        
        .info-box {
          background: rgba(255, 215, 0, 0.05);
          border-left: 3px solid #FFD700;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
          font-family: monospace;
          font-size: 13px;
          color: #FFD700;
        }
        
        .info-box strong {
          color: #FFD700;
          display: block;
          margin-bottom: 5px;
        }
        
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #FFD700, #FF8C00);
          color: #0f1420;
          padding: 14px 40px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 700;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin: 20px 0;
          box-shadow: 0 0 20px rgba(255, 215, 0, 0.3);
          border: none;
          cursor: pointer;
        }
        
        .cta-button:hover {
          box-shadow: 0 0 30px rgba(255, 215, 0, 0.5);
        }
        
        .code-display {
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255, 215, 0, 0.2);
          padding: 15px;
          border-radius: 8px;
          text-align: center;
          font-family: monospace;
          font-size: 24px;
          font-weight: 700;
          color: #00FF87;
          letter-spacing: 4px;
          margin: 20px 0;
          text-shadow: 0 0 10px rgba(0, 255, 135, 0.5);
        }
        
        .security-alert {
          background: rgba(255, 20, 147, 0.08);
          border: 1px solid rgba(255, 20, 147, 0.3);
          padding: 15px;
          border-radius: 8px;
          margin: 20px 0;
          font-size: 13px;
          color: #ffffff;
        }
        
        .security-alert strong {
          color: #FF1493;
          display: block;
          margin-bottom: 8px;
        }
        
        .button-group {
          display: flex;
          gap: 10px;
          margin: 20px 0;
          justify-content: center;
        }
        
        .button-small {
          display: inline-block;
          background: rgba(255, 215, 0, 0.1);
          border: 1px solid #FFD700;
          color: #FFD700;
          padding: 10px 20px;
          border-radius: 6px;
          text-decoration: none;
          font-weight: 600;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .button-small:hover {
          background: rgba(255, 215, 0, 0.2);
        }
        
        .footer {
          background: rgba(0, 0, 0, 0.3);
          padding: 30px;
          text-align: center;
          border-top: 1px solid rgba(255, 215, 0, 0.1);
          font-size: 12px;
          color: rgba(255, 255, 255, 0.7);
        }
        
        .tagline {
          font-size: 14px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin: 20px 0;
          color: #FFD700;
          text-shadow: 0 0 10px rgba(255, 215, 0, 0.4);
        }
        
        .divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255, 215, 0, 0.3), transparent);
          margin: 30px 0;
        }
        
        @media (max-width: 600px) {
          .container { padding: 10px; }
          .header-content { padding: 30px 20px; }
          .content { padding: 25px 20px; }
          .footer { padding: 20px; }
          .title { font-size: 18px; }
          .button-group { flex-direction: column; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="email-wrapper">
          <div class="header">
            <div class="header-content">
              <div class="logo-box">
                <div class="logo-text">D</div>
              </div>
              <div class="logo-subtitle">DGC Arcade</div>
              <div class="title">${title}</div>
            </div>
          </div>
          
          <div class="content">
            ${content}
          </div>
          
          <div class="footer">
            <div class="divider"></div>
            <div class="tagline">🎰 The Streets Always Win 🎰</div>
            <p style="margin-top: 15px; color: rgba(255, 255, 255, 0.7);">© ${new Date().getFullYear()} DGC Arcade · Licensed Gaming Platform</p>
            <p style="color: rgba(255, 255, 255, 0.7);">All games use provably fair algorithms. Play responsibly.</p>
            <p style="margin-top: 15px; font-size: 10px; color: rgba(255, 255, 255, 0.4);">
              This is an automated message. Please do not reply to this email.
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function sendWelcomeEmail(email: string, username: string, userType: "player" | "creator" | "admin" = "player") {
  if (!RESEND_API_KEY) {
    console.warn("Resend API key not configured. Email not sent.");
    return;
  }

  const typeFeatures = {
    player: "Play high-stakes games with instant payouts · Provably fair algorithms · Crypto native",
    creator: "Create tournaments · Manage affiliate links · Track earnings · Premium analytics",
    admin: "Full platform control · User management · Financial oversight · System configuration"
  };

  const content = `
    <p>Welcome to the elite, <strong>${username}</strong>!</p>
    <p>You've just joined the most secure and high-stakes crypto arcade on the planet.</p>
    
    <div class="info-box">
      <strong>Account Type: ${userType.toUpperCase()}</strong>
      ${typeFeatures[userType]}
    </div>
    
    <p>Your account is ready to go. Here's what you can do:</p>
    <ul>
      <li>🎮 Play Blackjack, Mines, Coin Flip, and more</li>
      <li>💰 Deposit and withdraw with crypto instantly</li>
      <li>🔐 Every game is provably fair · SHA-256 verified</li>
      <li>⚡ Instant payouts · No delays · No BS</li>
    </ul>
    
    <p style="text-align: center;">
      <a href="${SITE_URL}/games" class="cta-button">Start Playing Now</a>
    </p>
    
    <div class="security-alert">
      <strong>🔒 Security Tip:</strong> We'll send you an email every time you log in from a new device or location. If you don't recognize a login, you can block it immediately.
    </div>
  `;

  try {
    const resendClient = getResendClient();
    const result = await resendClient.emails.send({
      from: SENDER_EMAIL,
      to: email,
      subject: `Welcome to DGC Arcade, ${username}! 🎰`,
      html: getEmailTemplate(content, `Welcome, ${username}`),
    });

    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`);
    }

    console.log(`Welcome email sent to ${email}. Message ID: ${result.data?.id}`);
  } catch (err: any) {
    console.error("Failed to send welcome email:", err.message);
    throw err;
  }
}

export async function sendLoginSecurityEmail(
  email: string,
  username: string,
  ip: string,
  location: string,
  device: string,
  suspiciousActivityToken: string
) {
  if (!RESEND_API_KEY) {
    console.warn("Resend API key not configured. Email not sent.");
    return;
  }

  const suspiciousUrl = `${SITE_URL}/security/report?token=${suspiciousActivityToken}`;

  const content = `
    <p>Hey <strong>${username}</strong>,</p>
    <p>We detected a login to your DGC Arcade account. Here are the details:</p>
    
    <div class="info-box">
      <strong>📍 Location:</strong> ${location}<br>
      <strong>🌐 IP Address:</strong> ${ip}<br>
      <strong>💻 Device:</strong> ${device}<br>
      <strong>⏰ Time:</strong> ${new Date().toLocaleString()}
    </div>
    
    <p style="margin-top: 20px;"><strong>Was this you?</strong></p>
    
    <div class="button-group">
      <a href="${SITE_URL}" class="button-small">✓ Yes, This Was Me</a>
      <a href="${suspiciousUrl}" class="button-small">✗ No, This Wasn't Me</a>
    </div>
    
    <div class="security-alert">
      <strong>🚨 If this wasn't you:</strong> Click the button above immediately. We'll secure your account and send you a password reset link.
    </div>
  `;

  try {
    const resendClient = getResendClient();
    const result = await resendClient.emails.send({
      from: SENDER_EMAIL,
      to: email,
      subject: `🔒 Login Alert: ${location}`,
      html: getEmailTemplate(content, "Login Security Alert"),
    });

    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`);
    }

    console.log(`Login security email sent to ${email}. Message ID: ${result.data?.id}`);
  } catch (err: any) {
    console.error("Failed to send login security email:", err.message);
    throw err;
  }
}

export async function sendDepositConfirmationEmail(
  email: string,
  username: string,
  amount: string,
  currency: string,
  txHash: string
) {
  if (!RESEND_API_KEY) {
    console.warn("Resend API key not configured. Email not sent.");
    return;
  }

  const content = `
    <p>Your deposit has been received, <strong>${username}</strong>!</p>
    
    <div class="info-box">
      <strong>💰 Amount:</strong> ${amount} ${currency}<br>
      <strong>📦 Transaction:</strong> ${txHash.substring(0, 16)}...<br>
      <strong>⏰ Time:</strong> ${new Date().toLocaleString()}
    </div>
    
    <p>Your balance has been updated and you're ready to play. Head to the games and start winning!</p>
    
    <p style="text-align: center;">
      <a href="${SITE_URL}/games" class="cta-button">Play Now</a>
    </p>
  `;

  try {
    const resendClient = getResendClient();
    const result = await resendClient.emails.send({
      from: SENDER_EMAIL,
      to: email,
      subject: `💰 Deposit Confirmed: ${amount} ${currency}`,
      html: getEmailTemplate(content, "Deposit Received"),
    });

    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`);
    }

    console.log(`Deposit confirmation email sent to ${email}. Message ID: ${result.data?.id}`);
  } catch (err: any) {
    console.error("Failed to send deposit confirmation email:", err.message);
    throw err;
  }
}

export async function sendWithdrawalConfirmationEmail(
  email: string,
  username: string,
  amount: string,
  currency: string,
  address: string
) {
  if (!RESEND_API_KEY) {
    console.warn("Resend API key not configured. Email not sent.");
    return;
  }

  const maskedAddress = `${address.substring(0, 10)}...${address.substring(address.length - 10)}`;

  const content = `
    <p>Your withdrawal is processing, <strong>${username}</strong>!</p>
    
    <div class="info-box">
      <strong>💸 Amount:</strong> ${amount} ${currency}<br>
      <strong>📍 Wallet:</strong> ${maskedAddress}<br>
      <strong>⏰ Requested:</strong> ${new Date().toLocaleString()}
    </div>
    
    <p>Your funds are being sent to your wallet. Most withdrawals are confirmed on-chain within 10 minutes.</p>
    
    <div class="security-alert">
      <strong>💡 Tip:</strong> You can track your transaction on the blockchain using the address above.
    </div>
  `;

  try {
    const resendClient = getResendClient();
    const result = await resendClient.emails.send({
      from: SENDER_EMAIL,
      to: email,
      subject: `💸 Withdrawal Processing: ${amount} ${currency}`,
      html: getEmailTemplate(content, "Withdrawal Confirmed"),
    });

    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`);
    }

    console.log(`Withdrawal confirmation email sent to ${email}. Message ID: ${result.data?.id}`);
  } catch (err: any) {
    console.error("Failed to send withdrawal confirmation email:", err.message);
    throw err;
  }
}

export async function sendEmailVerificationEmail(email: string, username: string, code: string, verifyLink: string) {
  if (!RESEND_API_KEY) {
    console.warn("Resend API key not configured. Email not sent.");
    return;
  }

  const content = `
    <p>Hi <strong>${username}</strong>,</p>
    <p>To complete your account setup, please verify your email address. You have two options:</p>
    
    <p style="margin-top: 25px;"><strong>Option 1: Click the button below</strong></p>
    <p style="text-align: center;">
      <a href="${verifyLink}" class="cta-button">Verify Email</a>
    </p>
    
    <p style="margin-top: 25px;"><strong>Option 2: Enter this code</strong></p>
    <div class="code-display">${code}</div>
    <p style="text-align: center; font-size: 13px; color: rgba(255, 255, 255, 0.6);">Enter this code on the verification screen</p>
    
    <div class="security-alert">
      <strong>⏰ This code expires in 24 hours.</strong> If you didn't request this, please ignore this email.
    </div>
  `;

  try {
    const resendClient = getResendClient();
    const result = await resendClient.emails.send({
      from: SENDER_EMAIL,
      to: email,
      subject: `Verify Your DGC Arcade Email`,
      html: getEmailTemplate(content, "Email Verification"),
    });

    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`);
    }

    console.log(`Email verification sent to ${email}. Message ID: ${result.data?.id}`);
  } catch (err: any) {
    console.error("Failed to send email verification:", err.message);
    throw err;
  }
}

export async function sendPasswordResetEmail(email: string, username: string, resetLink: string) {
  if (!RESEND_API_KEY) {
    console.warn("Resend API key not configured. Email not sent.");
    return;
  }

  const content = `
    <p>Hi <strong>${username}</strong>,</p>
    <p>We received a request to reset your DGC Arcade password. Click the button below to set a new one:</p>
    
    <p style="text-align: center;">
      <a href="${resetLink}" class="cta-button">Reset Password</a>
    </p>
    
    <div class="security-alert">
      <strong>⏰ This link expires in 60 minutes.</strong> If you didn't request this, you can safely ignore this email. Your account is secure.
    </div>
  `;

  try {
    const resendClient = getResendClient();
    const result = await resendClient.emails.send({
      from: SENDER_EMAIL,
      to: email,
      subject: `🔐 Password Reset Request`,
      html: getEmailTemplate(content, "Password Reset"),
    });

    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`);
    }

    console.log(`Password reset email sent to ${email}. Message ID: ${result.data?.id}`);
  } catch (err: any) {
    console.error("Failed to send password reset email:", err.message);
    throw err;
  }
}

export async function sendSuspiciousActivityEmail(
  email: string,
  username: string,
  ip: string,
  location: string,
  device: string
) {
  if (!RESEND_API_KEY) {
    console.warn("Resend API key not configured. Email not sent.");
    return;
  }

  const resetLink = `${SITE_URL}/reset-password`;

  const content = `
    <p>Hey <strong>${username}</strong>,</p>
    <p>We detected a suspicious login attempt on your account and have secured it immediately.</p>
    
    <div class="info-box">
      <strong>🚨 Attempted Login From:</strong><br>
      📍 ${location}<br>
      🌐 ${ip}<br>
      💻 ${device}
    </div>
    
    <p style="margin-top: 20px;"><strong>What we did:</strong></p>
    <ul>
      <li>✓ Blocked the suspicious login</li>
      <li>✓ Secured your account</li>
      <li>✓ Logged out all active sessions</li>
    </ul>
    
    <p><strong>What you should do:</strong></p>
    <p style="text-align: center;">
      <a href="${resetLink}" class="cta-button">Reset Your Password</a>
    </p>
    
    <div class="security-alert">
      <strong>💡 Pro Tip:</strong> If you recognize this location, you can re-enable it in your security settings after resetting your password.
    </div>
  `;

  try {
    const resendClient = getResendClient();
    const result = await resendClient.emails.send({
      from: SENDER_EMAIL,
      to: email,
      subject: `🚨 Security Alert: Suspicious Activity Blocked`,
      html: getEmailTemplate(content, "Security Alert"),
    });

    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`);
    }

    console.log(`Suspicious activity email sent to ${email}. Message ID: ${result.data?.id}`);
  } catch (err: any) {
    console.error("Failed to send suspicious activity email:", err.message);
    throw err;
  }
}
