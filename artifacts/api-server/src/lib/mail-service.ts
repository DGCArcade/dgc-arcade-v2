import nodemailer from "nodemailer";

/**
 * Professional Mail Service for DGC Arcade
 * Configured for Proton Mail / SMTP delivery
 */

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587");
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SITE_URL = process.env.SITE_URL || "https://dgcarcade.io";

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // true for 465, false for other ports
  auth: {
    user: SMTP_USER,
    password: SMTP_PASS,
  },
});

export async function sendVerificationEmail(email: string, username: string, code: string) {
  if (!SMTP_HOST || !SMTP_USER) {
    console.warn("Mail service not configured. Email not sent.");
    return;
  }

  const verifyUrl = `${SITE_URL}/settings?verify=${code}`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #ffffff; padding: 40px; border-radius: 20px; border: 1px solid #333;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #ff0080; font-size: 32px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; margin: 0;">DGC Arcade</h1>
        <p style="color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">High-Stakes Crypto Gaming</p>
      </div>
      
      <h2 style="font-size: 24px; margin-bottom: 20px;">Welcome, ${username}!</h2>
      <p style="font-size: 16px; line-height: 1.6; color: #ccc;">
        To secure your account and enable full platform features, please verify your email address by clicking the button below:
      </p>
      
      <div style="text-align: center; margin: 40px 0;">
        <a href="${verifyUrl}" style="background: #ff0080; color: white; padding: 15px 35px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 18px; display: inline-block; box-shadow: 0 4px 15px rgba(255,0,128,0.3);">
          VERIFY EMAIL NOW
        </a>
      </div>
      
      <p style="font-size: 14px; color: #666; text-align: center;">
        If you didn't create an account on DGC Arcade, you can safely ignore this email.
      </p>
      
      <hr style="border: 0; border-top: 1px solid #333; margin: 40px 0;">
      
      <div style="text-align: center; font-size: 12px; color: #444;">
        © ${new Date().getFullYear()} DGC Arcade Ltd. · All Rights Reserved
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"DGC Arcade" <${SMTP_USER}>`,
    to: email,
    subject: "Verify your DGC Arcade account",
    html,
  });
}

export async function sendPasswordResetEmail(email: string, username: string, token: string) {
  if (!SMTP_HOST || !SMTP_USER) {
    console.warn("Mail service not configured. Email not sent.");
    return;
  }

  const resetUrl = `${SITE_URL}/reset-password?token=${token}`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #ffffff; padding: 40px; border-radius: 20px; border: 1px solid #333;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #ff0080; font-size: 32px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; margin: 0;">DGC Arcade</h1>
      </div>
      
      <h2 style="font-size: 24px; margin-bottom: 20px;">Password Reset</h2>
      <p style="font-size: 16px; line-height: 1.6; color: #ccc;">
        Hi ${username}, we received a request to reset your password. Click the button below to choose a new one:
      </p>
      
      <div style="text-align: center; margin: 40px 0;">
        <a href="${resetUrl}" style="background: #333; color: white; padding: 15px 35px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 18px; display: inline-block; border: 1px solid #ff0080;">
          RESET PASSWORD
        </a>
      </div>
      
      <p style="font-size: 14px; color: #666; text-align: center;">
        This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"DGC Arcade" <${SMTP_USER}>`,
    to: email,
    subject: "Password Reset Request - DGC Arcade",
    html,
  });
}
