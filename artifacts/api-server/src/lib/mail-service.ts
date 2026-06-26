import { Resend } from "resend";

/**
 * Professional Mail Service for DGC Arcade
 * Configured for Resend for automated emails
 * Features: DGC branding, neon glow effects, "The Streets Always Win" tagline
 * All verification codes are prominently displayed
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
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
          background-color: #0a0e1a; 
          color: #ffffff;
          line-height: 1.6;
        }
        
        .container { 
          max-width: 600px; 
          margin: 0 auto; 
          padding: 20px;
          background: #0a0e1a;
        }
        
        .email-wrapper {
          background: linear-gradient(135deg, #0f1420 0%, #1a1f2e 50%, #0f1420 100%);
          border: 2px solid;
          border-image: linear-gradient(90deg, #FFD700, #FF8C00, #FF1493, #B44FFF, #00D4FF, #00FF87, #FFD700) 1;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 0 40px rgba(255, 215, 0, 0.15);
        }
        
        .header {
          background: linear-gradient(90deg, #FFD700, #FF8C00, #FF1493, #B44FFF, #00D4FF, #00FF87, #FFD700);
          background-size: 300% 300%;
          padding: 3px;
          position: relative;
        }
        
        .header-content {
          background: linear-gradient(135deg, #0f1420 0%, #1a1f2e 100%);
          padding: 40px 30px;
          text-align: center;
        }
        
        .logo-box {
          width: 70px;
          height: 70px;
          margin: 0 auto 15px;
          background: linear-gradient(135deg, #FFD700 0%, #FF8C00 100%);
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 25px rgba(255, 215, 0, 0.5), 0 0 50px rgba(255, 140, 0, 0.3);
          font-size: 40px;
          font-weight: 900;
          color: #0f1420;
          line-height: 1;
        }
        
        .logo-subtitle {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 3px;
          color: #FFD700;
          text-shadow: 0 0 15px rgba(255, 215, 0, 0.6);
          font-weight: 700;
          margin-top: 10px;
        }
        
        .title {
          font-size: 26px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin-top: 20px;
          color: #FFD700;
          text-shadow: 0 0 15px rgba(255, 215, 0, 0.4);
        }
        
        .content {
          padding: 40px 30px;
          color: #ffffff;
          font-size: 15px;
          line-height: 1.8;
        }
        
        .content p {
          margin-bottom: 16px;
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
          margin-bottom: 10px;
          color: #ffffff;
        }
        
        .info-box {
          background: rgba(255, 215, 0, 0.08);
          border-left: 4px solid #FFD700;
          padding: 16px;
          margin: 20px 0;
          border-radius: 6px;
          font-size: 14px;
          color: #ffffff;
        }
        
        .info-box strong {
          color: #FFD700;
          display: block;
          margin-bottom: 6px;
          font-size: 13px;
        }
        
        .code-display {
          background: linear-gradient(135deg, rgba(255, 215, 0, 0.1) 0%, rgba(255, 140, 0, 0.05) 100%);
          border: 2px solid #FFD700;
          padding: 24px;
          border-radius: 12px;
          text-align: center;
          font-family: 'Courier New', monospace;
          font-size: 32px;
          font-weight: 900;
          color: #00FF87;
          letter-spacing: 6px;
          margin: 25px 0;
          text-shadow: 0 0 20px rgba(0, 255, 135, 0.6);
          box-shadow: 0 0 30px rgba(255, 215, 0, 0.2), inset 0 0 20px rgba(0, 255, 135, 0.1);
        }
        
        .code-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 2px;
          color: #FFD700;
          margin-bottom: 12px;
          font-weight: 700;
        }
        
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #FFD700 0%, #FF8C00 100%);
          color: #0f1420;
          padding: 16px 45px;
          border-radius: 10px;
          text-decoration: none;
          font-weight: 700;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          margin: 20px 0;
          box-shadow: 0 0 25px rgba(255, 215, 0, 0.4);
          border: none;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        
        .cta-button:hover {
          box-shadow: 0 0 40px rgba(255, 215, 0, 0.6);
          transform: translateY(-2px);
        }
        
        .security-alert {
          background: rgba(255, 20, 147, 0.1);
          border: 2px solid rgba(255, 20, 147, 0.4);
          padding: 16px;
          border-radius: 8px;
          margin: 20px 0;
          font-size: 14px;
          color: #ffffff;
        }
        
        .security-alert strong {
          color: #FF1493;
          display: block;
          margin-bottom: 8px;
          font-size: 13px;
        }
        
        .button-group {
          display: flex;
          gap: 12px;
          margin: 20px 0;
          justify-content: center;
          flex-wrap: wrap;
        }
        
        .button-small {
          display: inline-block;
          background: rgba(255, 215, 0, 0.12);
          border: 2px solid #FFD700;
          color: #FFD700;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 700;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          transition: all 0.3s ease;
        }
        
        .button-small:hover {
          background: rgba(255, 215, 0, 0.25);
          box-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
        }
        
        .footer {
          background: rgba(0, 0, 0, 0.4);
          padding: 30px;
          text-align: center;
          border-top: 1px solid rgba(255, 215, 0, 0.15);
          font-size: 12px;
          color: rgba(255, 255, 255, 0.75);
        }
        
        .tagline {
          font-size: 15px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 2.5px;
          margin: 20px 0;
          color: #FFD700;
          text-shadow: 0 0 15px rgba(255, 215, 0, 0.5);
        }
        
        .divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255, 215, 0, 0.3), transparent);
          margin: 30px 0;
        }
        
        @media (max-width: 600px) {
          .container { padding: 12px; }
          .header-content { padding: 30px 20px; }
          .content { padding: 25px 20px; }
          .footer { padding: 20px; }
          .title { font-size: 20px; }
          .code-display { font-size: 24px; letter-spacing: 4px; padding: 18px; }
          .button-group { flex-direction: column; }
          .button-small { width: 100%; text-align: center; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="email-wrapper">
          <div class="header">
            <div class="header-content">
              <div class="logo-box">D</div>
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
            <p style="margin-top: 15px;">© ${new Date().getFullYear()} DGC Arcade · Licensed Gaming Platform</p>
            <p style="margin-top: 10px; font-size: 11px;">All games use provably fair algorithms. Play responsibly.</p>
            <p style="margin-top: 15px; font-size: 10px; color: rgba(255, 255, 255, 0.5);">
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
    
    <p style="margin-top: 25px; margin-bottom: 12px;"><strong>Option 1: Click the button below</strong></p>
    <p style="text-align: center;">
      <a href="${verifyLink}" class="cta-button">Verify Email</a>
    </p>
    
    <p style="margin-top: 30px; margin-bottom: 12px;"><strong>Option 2: Enter this code on the verification screen</strong></p>
    <div class="code-label">Your Verification Code:</div>
    <div class="code-display">${code}</div>
    <p style="text-align: center; font-size: 13px; color: rgba(255, 255, 255, 0.7); margin-top: 10px;">Copy and paste this code where prompted</p>
    
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
