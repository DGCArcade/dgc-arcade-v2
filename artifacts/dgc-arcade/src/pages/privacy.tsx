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
          <p className="text-muted-foreground text-sm">Effective Date: June 11, 2026 · Last Updated: June 11, 2026</p>
        </div>
      </div>
      <div className="prose prose-invert max-w-none space-y-8 text-sm text-muted-foreground leading-relaxed">

        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-sm">
          <p className="font-bold text-foreground mb-1">Our Commitment to You</p>
          <p>DGC Arcade collects only what we need, protects what we hold, and is honest about how we use it. We do not sell your data. We do not share it for marketing. Every piece of information we collect has a specific, lawful purpose — and we tell you exactly what that is in this policy.</p>
        </div>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">1. Who We Are</h2>
          <p><strong className="text-foreground">DGC Arcade Ltd.</strong> ("we", "us", "our", "DGC Arcade") is the operator of the DGC Arcade gaming platform, licensed by the Curaçao Gaming Authority under License No. 8048/JAZ.</p>
          <p className="mt-2">For all privacy-related inquiries, contact our Data Protection team at <strong className="text-foreground">privacy@dgcarcade.io</strong>.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-4">2. What We Collect and Why</h2>
          <p className="mb-4">We collect information across several categories. Below we explain exactly what we collect, why we collect it, and the legal basis for doing so.</p>

          <div className="space-y-5">
            <div className="bg-secondary/30 rounded-xl p-4 border border-border/40">
              <h3 className="font-bold text-foreground mb-2">2.1 Account Information</h3>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong className="text-foreground">Username and password</strong> — required to create and secure your account</li>
                <li><strong className="text-foreground">Email address</strong> — for account communications and security alerts</li>
                <li><strong className="text-foreground">Date of birth</strong> — to verify you are 18 or older as required by our license</li>
                <li><strong className="text-foreground">Country of residence</strong> — to ensure you are not located in a restricted jurisdiction</li>
              </ul>
              <p className="mt-2 text-xs text-muted-foreground/70"><strong>Legal basis:</strong> Contractual necessity and legal obligation (gaming license compliance)</p>
            </div>

            <div className="bg-secondary/30 rounded-xl p-4 border border-border/40">
              <h3 className="font-bold text-foreground mb-2">2.2 Location Verification Data</h3>
              <p className="mb-2">Every time you access DGC Arcade, we perform a location check required by our Curaçao Gaming Authority license. This check collects:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong className="text-foreground">IP address</strong> — your public internet address</li>
                <li><strong className="text-foreground">Country and country code</strong></li>
                <li><strong className="text-foreground">Region and city</strong></li>
                <li><strong className="text-foreground">Geographic coordinates</strong> — latitude and longitude (approximate, IP-based)</li>
                <li><strong className="text-foreground">Timezone</strong> — your detected timezone from IP data</li>
                <li><strong className="text-foreground">Internet Service Provider (ISP)</strong> — your network provider</li>
                <li><strong className="text-foreground">Autonomous System Number (ASN)</strong> — technical network identifier</li>
              </ul>
              <p className="mt-2 text-xs text-muted-foreground/70"><strong>Legal basis:</strong> Legal obligation (gaming license), legitimate interest (fraud prevention)</p>
            </div>

            <div className="bg-secondary/30 rounded-xl p-4 border border-border/40">
              <h3 className="font-bold text-foreground mb-2">2.3 Device Information</h3>
              <p className="mb-2">When you accept our location verification, we collect the following device information to detect fraud, prevent multi-accounting, and maintain platform security:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong className="text-foreground">Device name and model</strong> — e.g., iPhone, Samsung Galaxy S24, Windows PC, MacBook, Linux device</li>
                <li><strong className="text-foreground">Operating system and version</strong> — e.g., iOS 17.4, Android 14, Windows 11, macOS 14.4, Ubuntu Linux</li>
                <li><strong className="text-foreground">Browser name and version</strong> — e.g., Chrome 123, Safari 17, Firefox 124</li>
                <li><strong className="text-foreground">Device type</strong> — mobile, tablet, or desktop</li>
                <li><strong className="text-foreground">Screen resolution and color depth</strong></li>
                <li><strong className="text-foreground">Hardware concurrency</strong> — number of CPU cores available</li>
                <li><strong className="text-foreground">Device language and platform settings</strong></li>
                <li><strong className="text-foreground">Device fingerprint</strong> — a combined technical identifier derived from the above, used for fraud detection and account security</li>
              </ul>
              <p className="mt-2 text-xs text-muted-foreground/70"><strong>Legal basis:</strong> Legitimate interest (fraud prevention, platform security, AML compliance)</p>
            </div>

            <div className="bg-secondary/30 rounded-xl p-4 border border-border/40">
              <h3 className="font-bold text-foreground mb-2">2.4 VPN and Proxy Detection</h3>
              <p className="mb-2">We analyze technical signals to detect whether you are using a VPN, proxy service, Tor network, or connecting through a datacenter IP. These signals include:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Whether your IP address belongs to a known VPN provider</li>
                <li>Whether your IP is associated with a datacenter or hosting provider rather than a residential ISP</li>
                <li>Whether your browser timezone matches your IP address timezone</li>
                <li>Whether your connection shows characteristics of Tor exit nodes</li>
              </ul>
              <p className="mt-2"><strong className="text-foreground">Important:</strong> VPN use alone is not grounds for account suspension. We collect this data to support fraud investigations, regulatory compliance, and to verify jurisdictional eligibility. If VPN use is combined with other fraud signals or used to circumvent a jurisdiction block, your account may be reviewed.</p>
              <p className="mt-2 text-xs text-muted-foreground/70"><strong>Legal basis:</strong> Legal obligation (gaming license), legitimate interest (fraud prevention, AML)</p>
            </div>

            <div className="bg-secondary/30 rounded-xl p-4 border border-border/40">
              <h3 className="font-bold text-foreground mb-2">2.5 Financial and Transaction Data</h3>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong className="text-foreground">Cryptocurrency wallet addresses</strong> — for deposit and withdrawal processing</li>
                <li><strong className="text-foreground">Transaction history</strong> — all deposits, withdrawals, and their statuses</li>
                <li><strong className="text-foreground">Blockchain transaction hashes</strong> — for verification and audit</li>
                <li><strong className="text-foreground">Total deposited and wagered amounts</strong> — for AML monitoring and bonus tracking</li>
              </ul>
              <p className="mt-2 text-xs text-muted-foreground/70"><strong>Legal basis:</strong> Contractual necessity, legal obligation (AML/KYC regulations)</p>
            </div>

            <div className="bg-secondary/30 rounded-xl p-4 border border-border/40">
              <h3 className="font-bold text-foreground mb-2">2.6 Gaming Activity Data</h3>
              <ul className="list-disc pl-4 space-y-1">
                <li>All bets placed — game, amount, outcome, timestamp</li>
                <li>Win and loss history</li>
                <li>Session duration and activity patterns</li>
                <li>Responsible gambling interactions (limit settings, self-exclusion)</li>
              </ul>
              <p className="mt-2 text-xs text-muted-foreground/70"><strong>Legal basis:</strong> Contractual necessity, legal obligation (responsible gambling regulations)</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">3. How We Use Your Information</h2>
          <div className="space-y-2">
            {[
              ["Platform Operation", "To provide, run, and improve DGC Arcade and all its games"],
              ["Identity Verification", "To confirm you are who you say you are and meet age requirements"],
              ["Jurisdictional Compliance", "To ensure you are not accessing from a restricted region"],
              ["Fraud and AML Prevention", "To detect multi-accounting, money laundering, and prohibited activity"],
              ["Security", "To protect your account and our platform from unauthorized access"],
              ["Transaction Processing", "To handle deposits, withdrawals, and bonuses accurately"],
              ["AI Fraud Monitoring", "Our systems analyze transaction patterns to flag suspicious activity for human review"],
              ["Customer Support", "To investigate and resolve issues you report"],
              ["Legal Compliance", "To fulfill obligations under our gaming license and applicable law"],
              ["Responsible Gambling", "To identify problem gambling patterns and offer appropriate tools"],
            ].map(([title, desc]) => (
              <div key={title} className="flex gap-3 items-start">
                <span className="text-primary mt-0.5 flex-shrink-0">→</span>
                <span><strong className="text-foreground">{title}:</strong> {desc}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">4. Data Sharing</h2>
          <p className="mb-3">We do not sell, rent, or trade your personal data. Full stop. We share data only in the following limited circumstances:</p>
          <div className="space-y-3">
            <div className="bg-secondary/30 rounded-xl p-4 border border-border/40">
              <p><strong className="text-foreground">Payment Processors (Plisio):</strong> We share transaction data necessary to process your cryptocurrency deposits and withdrawals. Plisio operates under its own privacy policy and data processing agreement with us.</p>
            </div>
            <div className="bg-secondary/30 rounded-xl p-4 border border-border/40">
              <p><strong className="text-foreground">Legal Authorities:</strong> We will disclose your data when required by a valid court order, law enforcement request, or regulatory authority. We will notify you of such requests where legally permitted to do so.</p>
            </div>
            <div className="bg-secondary/30 rounded-xl p-4 border border-border/40">
              <p><strong className="text-foreground">Infrastructure Providers:</strong> We use Neon (database), Render (hosting), and similar technical services. These providers process data on our behalf under strict data processing agreements and are prohibited from using your data for their own purposes.</p>
            </div>
            <div className="bg-secondary/30 rounded-xl p-4 border border-border/40">
              <p><strong className="text-foreground">KYC/AML Verification (future):</strong> If we implement formal KYC verification, identity documents will be shared with licensed verification providers solely for that purpose.</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">5. Cookies and Local Storage</h2>
          <p className="mb-3">We use browser storage technologies for the following purposes:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-foreground">Authentication tokens</strong> — to keep you logged in securely</li>
            <li><strong className="text-foreground">Session storage</strong> — to track your location verification status within a browsing session (cleared when you close your browser)</li>
            <li><strong className="text-foreground">Theme preferences</strong> — to remember your chosen display theme</li>
            <li><strong className="text-foreground">Device fingerprint</strong> — stored locally to assist with fraud detection</li>
          </ul>
          <p className="mt-3">We do not use third-party advertising cookies. We do not use cross-site tracking cookies. You can clear browser storage at any time through your browser settings.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">6. Data Retention</h2>
          <div className="space-y-2">
            {[
              ["Active accounts", "All data retained for the life of the account"],
              ["Closed accounts", "Financial and identity records retained for 5 years minimum (AML requirement)"],
              ["KYC documents", "Retained for 7 years as required by anti-money laundering law"],
              ["Location and device logs", "Retained for 3 years for fraud investigation purposes"],
              ["Session data", "Cleared at browser close (sessionStorage)"],
              ["Deleted accounts", "Data anonymized after 1 year, except where legal obligation requires retention"],
            ].map(([period, desc]) => (
              <div key={period} className="flex gap-3 items-start">
                <span className="text-primary mt-0.5 flex-shrink-0 font-mono text-xs bg-primary/10 px-1.5 py-0.5 rounded">→</span>
                <span><strong className="text-foreground">{period}:</strong> {desc}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">7. Your Rights</h2>
          <p className="mb-3">Depending on your jurisdiction, you have the following rights regarding your personal data:</p>
          <div className="grid grid-cols-1 gap-3">
            {[
              ["Access", "Request a copy of all personal data we hold about you"],
              ["Rectification", "Correct inaccurate or incomplete data"],
              ["Erasure", "Request deletion of your data, subject to legal retention obligations"],
              ["Restriction", "Ask us to pause processing of your data in certain circumstances"],
              ["Portability", "Receive your data in a machine-readable format"],
              ["Objection", "Object to processing based on legitimate interests"],
              ["Withdraw Consent", "Where processing is based on consent, withdraw it at any time"],
            ].map(([right, desc]) => (
              <div key={right} className="flex gap-3 items-start bg-secondary/20 rounded-lg p-3 border border-border/30">
                <span className="text-primary font-bold flex-shrink-0 w-24 text-xs uppercase tracking-wider">{right}</span>
                <span className="text-xs">{desc}</span>
              </div>
            ))}
          </div>
          <p className="mt-3">To exercise any right, email <strong className="text-foreground">privacy@dgcarcade.io</strong> with your username and request. We will respond within 30 days. We may require identity verification before acting on your request.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">8. Security Measures</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>TLS 1.3 encryption for all data in transit</li>
            <li>bcrypt password hashing — your password is never stored in readable form</li>
            <li>JWT-based authentication with server-side token validation</li>
            <li>Database access restricted to server infrastructure only — no direct public access</li>
            <li>All admin actions logged and auditable</li>
            <li>AI fraud monitoring on all withdrawal transactions</li>
          </ul>
          <p className="mt-3">No system is 100% secure. If you believe your account has been compromised, contact us immediately at <strong className="text-foreground">support@dgcarcade.io</strong>.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">9. Children</h2>
          <p>DGC Arcade is strictly for users 18 years of age and older. We do not knowingly collect data from anyone under 18. If we discover that a user is under 18, their account will be immediately closed and their data deleted.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">10. Changes to This Policy</h2>
          <p>We will notify you of material changes to this Privacy Policy via in-app notification or email at least 14 days before they take effect. Continued use of the platform after that date constitutes acceptance.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">11. Contact</h2>
          <div className="bg-secondary/30 rounded-xl p-4 border border-border/40 space-y-1">
            <p><strong className="text-foreground">Data Protection:</strong> privacy@dgcarcade.io</p>
            <p><strong className="text-foreground">General Support:</strong> support@dgcarcade.io</p>
            <p><strong className="text-foreground">Operator:</strong> DGC Arcade Ltd. — DGCArcade.io</p>
          </div>
        </section>

      </div>
    </div>
  );
}