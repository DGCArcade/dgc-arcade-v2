import { Link } from "wouter";
import { ChevronLeft, Shield } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> Home
        </Link>
      </div>
      <div className="flex items-center gap-3 mb-8">
        <Shield className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-3xl font-display font-black uppercase tracking-tight">Terms of Service</h1>
          <p className="text-muted-foreground text-sm">Effective Date: June 11, 2026 · Last Updated: June 11, 2026</p>
        </div>
      </div>
      <div className="prose prose-invert max-w-none space-y-8 text-sm text-muted-foreground leading-relaxed">

        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-yellow-200 text-sm font-medium">
          ⚠️ You must be 18 years or older to use DGC Arcade. Gambling involves real money and real risk. Play responsibly. Never gamble more than you can afford to lose.
        </div>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">1. Company Information</h2>
          <p>DGC Arcade (the "Platform") is operated by <strong className="text-foreground">Medium Rare N.V.</strong>, incorporated under the laws of Curaçao, registered at Abraham de Veerstraat 9, Willemstad, Curaçao. We hold a gaming license issued by the Curaçao Gaming Authority under <strong className="text-foreground">License No. 8048/JAZ</strong>.</p>
          <p className="mt-2">Support: <strong className="text-foreground">support@differentgrindcrew.com</strong></p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">2. Eligibility</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>You must be at least <strong className="text-foreground">18 years of age</strong>, or the legal gambling age in your jurisdiction — whichever is higher.</li>
            <li>You must not be located in a <strong className="text-foreground">Restricted Jurisdiction</strong>, including but not limited to: United Kingdom, France, Netherlands, Australia, Belgium, Denmark, Germany, Italy, Romania, Spain, Sweden, Switzerland, Czech Republic, and United States (except permitted states).</li>
            <li>You must not be a politically exposed person (PEP) without prior written approval from compliance.</li>
            <li>You must be acting on your own behalf — not as an agent or representative of another person.</li>
            <li>Only one account per person is permitted. Multiple accounts will be permanently closed without notice and funds may be forfeited.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">3. Location Verification</h2>
          <p>Before accessing the Platform, you must complete our location verification process. This involves:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Consenting to location verification via your IP address</li>
            <li>Allowing our systems to determine your country and region</li>
            <li>Confirming you are 18+ and not in a restricted jurisdiction</li>
          </ul>
          <p className="mt-2">This verification is performed on every new browser session. You may not circumvent this process to gain access from a restricted jurisdiction. Doing so constitutes a breach of these Terms and will result in immediate account closure and potential reporting to relevant authorities.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">4. Account Registration and Security</h2>
          <p>All information you provide must be accurate, complete, and current. You are responsible for:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Maintaining the confidentiality of your login credentials</li>
            <li>All activity that occurs under your account</li>
            <li>Notifying us immediately of unauthorized access at <strong className="text-foreground">support@differentgrindcrew.com</strong></li>
          </ul>
          <p className="mt-2">DGC Arcade reserves the right to request identity verification documents at any time. Failure to provide documents within the requested timeframe may result in account suspension or withdrawal restrictions.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">5. Device and Technical Monitoring</h2>
          <p>By using DGC Arcade, you acknowledge and consent to the following technical data collection for the purposes of fraud prevention, platform security, and regulatory compliance:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong className="text-foreground">Device information:</strong> We collect your device model and name, operating system and version, browser name and version, and device type (mobile, tablet, desktop). This includes all device types — iPhone, Android devices, Windows PCs, Macs, Linux systems, and Chromebooks.</li>
            <li><strong className="text-foreground">Device fingerprint:</strong> A technical identifier derived from your device and browser characteristics, used to detect fraud and prevent multi-accounting.</li>
            <li><strong className="text-foreground">Connection monitoring:</strong> We analyze your network connection for signals of VPN use, proxy services, Tor routing, or datacenter IP addresses.</li>
          </ul>
          <p className="mt-2">This data is retained securely and used only for the purposes described in our <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>. It is never sold to third parties.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">6. VPN and Proxy Usage</h2>
          <p>VPN, proxy, or anonymizing service usage is <strong className="text-foreground">not automatically prohibited</strong> on DGC Arcade. However:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>We detect and log VPN and proxy usage as part of our fraud and compliance monitoring.</li>
            <li>Using a VPN to access the Platform from a <strong className="text-foreground">restricted jurisdiction</strong> is a direct violation of these Terms and will result in immediate account closure and forfeiture of funds.</li>
            <li>VPN use combined with other fraud signals may trigger a manual account review.</li>
            <li>VPN detection data may be shared with regulatory authorities where required by law.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">7. Deposits and Withdrawals</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>All transactions are processed in cryptocurrency via our payment partner, Plisio.</li>
            <li>Minimum deposit: <strong className="text-foreground">$1.00 USD equivalent.</strong> Minimum withdrawal: <strong className="text-foreground">$10.00 USD equivalent.</strong></li>
            <li>DGC Arcade is not responsible for exchange rate fluctuations between USD and cryptocurrency.</li>
            <li>Withdrawals are reviewed and processed within 24 hours, subject to fraud and AML checks.</li>
            <li>We reserve the right to request additional verification before processing any withdrawal.</li>
            <li>Bonuses carry a <strong className="text-foreground">30× wagering requirement</strong> before withdrawal unless explicitly stated otherwise.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">8. Provably Fair Gaming</h2>
          <p>All games on DGC Arcade use a provably fair algorithm. Each outcome is generated using a combination of a server seed (hashed and committed before the bet) and a client seed that you control. You can verify any historical bet result using our provably fair verification tool. We cannot manipulate outcomes after a bet is placed.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">9. Prohibited Activities</h2>
          <p>The following activities will result in immediate permanent account closure and forfeiture of all funds:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Using bots, scripts, or any automated means to interact with the Platform</li>
            <li>Exploiting software bugs or vulnerabilities — these must be reported immediately to support</li>
            <li>Money laundering, structuring, or any illegal financial activity</li>
            <li>Collusion with other players</li>
            <li>Creating multiple accounts or bonus abuse</li>
            <li>Chargeback fraud or disputing legitimate transactions</li>
            <li>Using a VPN or proxy to access the Platform from a restricted jurisdiction</li>
            <li>Sharing your account credentials with any other person</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">10. Responsible Gambling</h2>
          <p>DGC Arcade takes responsible gambling seriously. We offer:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Deposit limits</li>
            <li>Session time limits</li>
            <li>Cool-off periods</li>
            <li>Self-exclusion</li>
          </ul>
          <p className="mt-2">See our <Link href="/responsible-gambling" className="text-primary hover:underline">Responsible Gambling page</Link> for full details. If you believe gambling is negatively affecting your life, please seek help at <strong className="text-foreground">ncpgambling.org</strong> or call the National Problem Gambling Helpline: 1-800-522-4700.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">11. AI Fraud Monitoring</h2>
          <p>DGC Arcade uses an AI-powered fraud detection system that monitors all transactions in real time. This system automatically flags transactions that meet risk criteria including unusual velocity, large amounts, new account activity, and suspicious patterns. Flagged transactions are reviewed by our compliance team before processing. You consent to this monitoring by using the Platform.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">12. Limitation of Liability</h2>
          <p>DGC Arcade shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Platform. Our maximum liability to you in any matter shall not exceed the total amount you deposited in the 30-day period preceding the relevant claim. We are not liable for losses caused by your failure to secure your account credentials or by network failures outside our control.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">13. Governing Law and Disputes</h2>
          <p>These Terms are governed by the laws of Curaçao. Any dispute shall first be addressed through our customer support process. Unresolved disputes shall be submitted to the exclusive jurisdiction of the courts of Curaçao, except where mandatory local law requires otherwise.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">14. Changes to These Terms</h2>
          <p>We reserve the right to modify these Terms at any time. We will provide at least 14 days' notice of material changes via in-app notification or email. Continued use of the Platform after the effective date of changes constitutes your acceptance of the updated Terms. If you disagree with changes, you must close your account before the effective date.</p>
        </section>

      </div>
    </div>
  );
}