import { Link } from "wouter";
import { ChevronLeft, Lock } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> Home
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-8">
        <Lock className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-3xl font-display font-black uppercase tracking-tight">Privacy Policy</h1>
          <p className="text-muted-foreground text-sm">Last updated: June 2025</p>
        </div>
      </div>

      <div className="prose prose-invert max-w-none space-y-8 text-sm text-muted-foreground leading-relaxed">

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">1. Introduction</h2>
          <p>Medium Rare N.V. ("we", "us", "our") operates DGC Arcade and is committed to protecting your personal information. This Privacy Policy explains how we collect, use, store, and share your data when you use our Platform.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">2. Information We Collect</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-foreground">Account Data:</strong> Username, email address, date of birth, country of residence.</li>
            <li><strong className="text-foreground">KYC Data:</strong> Government-issued ID, proof of address, and selfie photos (when required for verification).</li>
            <li><strong className="text-foreground">Financial Data:</strong> Cryptocurrency wallet addresses, transaction history, deposit and withdrawal records.</li>
            <li><strong className="text-foreground">Gaming Data:</strong> Bets placed, games played, win/loss history, session data.</li>
            <li><strong className="text-foreground">Technical Data:</strong> IP address, browser type, device identifiers, cookies, and usage analytics.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">3. How We Use Your Information</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>To provide, operate, and improve the Platform</li>
            <li>To verify your identity and comply with KYC/AML obligations</li>
            <li>To process deposits, withdrawals, and bonuses</li>
            <li>To prevent fraud, cheating, and money laundering</li>
            <li>To send you transactional and promotional communications (with consent)</li>
            <li>To fulfill legal obligations and cooperate with authorities</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">4. Data Sharing</h2>
          <p>We do not sell your personal data. We may share your information with:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-foreground">KYC/AML Providers:</strong> For identity verification purposes</li>
            <li><strong className="text-foreground">Payment Processors:</strong> To process cryptocurrency transactions</li>
            <li><strong className="text-foreground">Legal Authorities:</strong> When required by law or court order</li>
            <li><strong className="text-foreground">Service Providers:</strong> Hosting, analytics, and customer support tools under data processing agreements</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">5. Cookies</h2>
          <p>We use essential cookies for platform functionality (session management, authentication) and analytics cookies to understand how users interact with our Platform. You may disable non-essential cookies in your browser settings, though this may affect Platform functionality.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">6. Data Retention</h2>
          <p>We retain your personal data for as long as your account is active, and for a minimum of 5 years after account closure to comply with anti-money laundering regulations. KYC documents are retained for 7 years as required by law.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">7. Your Rights</h2>
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Access your personal data</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion ("right to be forgotten") — subject to legal obligations</li>
            <li>Object to or restrict processing</li>
            <li>Data portability</li>
          </ul>
          <p className="mt-2">To exercise these rights, contact us at <strong className="text-foreground">privacy@dgcarcade.io</strong>.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">8. Security</h2>
          <p>We implement industry-standard security measures including TLS encryption for data in transit, bcrypt password hashing, and restricted access to personal data. However, no system is completely secure, and we cannot guarantee absolute security.</p>
        </section>
      </div>
    </div>
  );
}
