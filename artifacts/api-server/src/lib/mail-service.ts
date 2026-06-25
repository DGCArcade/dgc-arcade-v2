import nodemailer from "nodemailer";

/**
 * Professional Mail Service for DGC Arcade
 * Configured for Proton Mail / SMTP delivery with retry logic
 */

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587");
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SITE_URL = process.env.SITE_URL || "https://dgcarcade.io";

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

let transporter: nodemailer.Transporter | null = null;

function initializeTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465, false for other ports
    auth: {
      user: SMTP_USER,
      password: SMTP_PASS,
    },
    connectionTimeout: 10000, // 10 seconds
    socketTimeout: 10000, // 10 seconds
    pool: {
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 4000,
      rateLimit: 14,
    },
  } as any);

  // Verify connection on startup
  transporter.verify((err, success) => {
    if (err) {
      console.error("SMTP connection verification failed:", err.message);
    } else if (success) {
      console.log("SMTP connection verified successfully");
    }
  });

  return transporter;
}

// Themes for emails to keep it "Best of the Best"
const THEMES = {
  GALAXY: {
    bg: "#0a0a0a",
    primary: "#ff0080", // Neon Pink
    secondary: "#7928ca", // Purple
    accent: "#0070f3", // Blue
    text: "#ffffff",
    muted: "#888888"
  },
  NEON: {
    bg: "#000000",
    primary: "#00ff00", // Lime
    secondary: "#00e5ff", // Cyan
    accent: "#ff00ff", // Magenta
    text: "#ffffff",
    muted: "#666666"
  }
};

function getEmailTemplate(content: string, theme = THEMES.GALAXY) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        body { margin: 0; padding: 0; font-family: 'Inter', sans-serif; background-color: ${theme.bg}; color: ${theme.text}; }
        .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
        .card { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px; padding: 40px; text-align: center; }
        .logo-container { margin-bottom: 30px; }
        .logo { 
          font-size: 36px; 
          font-weight: 900; 
          text-transform: uppercase; 
          letter-spacing: -1px;
          background: linear-gradient(to right, ${theme.primary}, ${theme.secondary}, ${theme.accent});
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          display: inline-block;
        }
        .tagline { color: ${theme.muted}; font-size: 10px; text-transform: uppercase; letter-spacing: 3px; margin-top: 5px; font-weight: 700; }
        .content { font-size: 16px; line-height: 1.6; color: rgba(255, 255, 255, 0.8); margin-bottom: 30px; text-align: left; }
        .btn { 
          display: inline-block; 
          background: linear-gradient(45deg, ${theme.primary}, ${theme.secondary}); 
          color: white; 
          padding: 16px 40px; 
          border-radius: 12px; 
          text-decoration: none; 
          font-weight: 800; 
          font-size: 16px; 
          text-transform: uppercase; 
          letter-spacing: 1px;
          box-shadow: 0 10px 20px rgba(255, 0, 128, 0.2);
        }
        .footer { margin-top: 40px; text-align: center; color: ${theme.muted}; font-size: 12px; }
        .confidential { 
          margin-top: 20px; 
          padding-top: 20px; 
          border-top: 1px solid rgba(255, 255, 255, 0.05); 
          font-size: 10px; 
          font-style: italic; 
          color: rgba(255, 255, 255, 0.3);
          line-height: 1.4;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="logo-container">
            <div class="logo">DGC Arcade</div>
            <div class="tagline">High-Stakes Crypto Gaming</div>
          </div>
          <div class="content">
            ${content}
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} DGC Arcade Ltd. · Licensed Gaming Platform</p>
            <p>All games use provably fair algorithms. Play responsibly.</p>
            <div class="confidential">
              CONFIDENTIALITY NOTICE: This email and any attachments are confidential and intended solely for the use of the individual or entity to whom they are addressed. If you have received this email in error, please notify the system manager. This message contains proprietary information and is intended only for the individual named. If you are not the named addressee, you should not disseminate, distribute or copy this e-mail.
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

async function sendEmailWithRetry(mailOptions: any, attempt = 1): Promise<void> {
  if (!SMTP_HOST || !SMTP_USER) {
    console.warn("Mail service not configured. Email not sent.");
    return;
  }

  const transporter = initializeTransporter();

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${mailOptions.to}`);
  } catch (err: any) {
    console.error(`Email send attempt ${attempt} failed:`, err.message);

    if (attempt < MAX_RETRIES) {
      console.log(`Retrying email send in ${RETRY_DELAY}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return sendEmailWithRetry(mailOptions, attempt + 1);
    } else {
      throw new Error(`Failed to send email after ${MAX_RETRIES} attempts: ${err.message}`);
    }
  }
}

export async function sendVerificationEmail(email: string, username: string, code: string) {
  const verifyUrl = `${SITE_URL}/settings?verify=${code}`;
  const content = `
    <h2 style="color: white; font-size: 24px; margin-bottom: 15px;">Welcome to the Elite, ${username}</h2>
    <p>You've just taken the first step into the most secure and high-stakes crypto arcade on the planet.</p>
    <p>To finalize your account and unlock instant withdrawals, please verify your email address below:</p>
    <div style="text-align: center; margin: 40px 0;">
      <a href="${verifyUrl}" class="btn">VERIFY ACCOUNT</a>
    </div>
    <p style="font-size: 13px;">Link expires in 24 hours. If you did not initiate this request, please secure your account immediately.</p>
  `;

  try {
    await sendEmailWithRetry({
      from: `"Different Grind Crew" <${SMTP_USER}>`,
      to: email,
      subject: "Action Required: Verify Your DGC Arcade Account",
      html: getEmailTemplate(content, THEMES.GALAXY),
    });
  } catch (err: any) {
    console.error("Failed to send verification email:", err.message);
    throw err;
  }
}

export async function sendPasswordResetEmail(email: string, username: string, token: string) {
  const resetUrl = `${SITE_URL}/reset-password?token=${token}`;
  const content = `
    <h2 style="color: white; font-size: 24px; margin-bottom: 15px;">Security Update</h2>
    <p>Hi ${username}, we received a request to reset your DGC Arcade password.</p>
    <p>Click the button below to establish your new secure credentials:</p>
    <div style="text-align: center; margin: 40px 0;">
      <a href="${resetUrl}" class="btn">RESET PASSWORD</a>
    </div>
    <p style="font-size: 13px; color: #ff4d4d;">This link is valid for 60 minutes only. If you did not request this reset, your account may be at risk—please contact support immediately.</p>
  `;

  try {
    await sendEmailWithRetry({
      from: `"Different Grind Crew" <${SMTP_USER}>`,
      to: email,
      subject: "Security: Password Reset Request",
      html: getEmailTemplate(content, THEMES.NEON),
    });
  } catch (err: any) {
    console.error("Failed to send password reset email:", err.message);
    throw err;
  }
}
