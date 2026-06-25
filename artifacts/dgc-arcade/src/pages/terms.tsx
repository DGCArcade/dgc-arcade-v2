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
          <p className="text-muted-foreground text-sm">Effective Date: June 11, 2026 · Last Updated: June 19, 2026</p>
        </div>
      </div>
      <div className="prose prose-invert max-w-none space-y-8 text-sm text-muted-foreground leading-relaxed">

        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-yellow-200 text-sm font-medium">
          ⚠️ You must be 18 years or older to use DGC Arcade. Gambling involves real money and real risk. Play responsibly. Never gamble more than you can afford to lose.
        </div>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">1. Company Information</h2>
          <p>DGC Arcade (the "Platform") is operated by <strong className="text-foreground">DGC Arcade Ltd.</strong>, a licensed gaming platform.</p>
          <p className="mt-2">Support: <strong className="text-foreground">support@dgcarcade.io</strong></p>
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
            <li>Notifying us immediately of unauthorized access at <strong className="text-foreground">support@dgcarcade.io</strong></li>
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
          <h2 className="text-lg font-bold text-foreground mb-3">8. Chargebacks and Payment Disputes</h2>
          <p>DGC Arcade operates exclusively with cryptocurrency. Because cryptocurrency transactions are <strong className="text-foreground">irreversible by design</strong>, the following policies apply:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li><strong className="text-foreground">No chargebacks:</strong> Cryptocurrency deposits cannot be reversed, charged back, or disputed through a payment processor or bank. By depositing, you acknowledge that all transfers are final.</li>
            <li><strong className="text-foreground">Fraudulent dispute attempts:</strong> Any attempt to initiate a chargeback, reversal, or fraudulent dispute — including filing a claim with a card issuer, exchange, or financial institution — will result in immediate permanent account closure and forfeiture of all funds. We reserve the right to pursue legal action to recover losses, costs, and damages.</li>
            <li><strong className="text-foreground">Deposit errors:</strong> If you believe a deposit was not credited correctly, contact support within 7 days with your transaction hash. We will investigate and credit any confirmed shortfall. Claims older than 7 days may not be processed.</li>
            <li><strong className="text-foreground">Withdrawal disputes:</strong> If a withdrawal is not received, contact support within 14 days. Include the transaction ID and destination address. Disputes are investigated on a case-by-case basis.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">9. Provably Fair Gaming & Cryptographic Integrity</h2>
          <p>DGC Arcade is built on the principle of absolute transparency. All games on the Platform utilize <strong className="text-foreground">Provably Fair</strong> algorithms, which provide mathematical proof that neither the Platform nor the player can manipulate the outcome of any game.</p>
          <div className="mt-4 space-y-4">
            <div className="bg-secondary/30 rounded-xl p-4 border border-border/40">
              <h3 className="font-bold text-foreground mb-2">9.1 SHA-256 Standard</h3>
              <p>We utilize the <strong className="text-foreground">SHA-256 (Secure Hash Algorithm 256-bit)</strong>, a cryptographic standard developed by the NSA. This is the same industrial-grade security used to secure the Bitcoin network and global financial systems. SHA-256 is a "one-way" function, ensuring that once a result is hashed, it cannot be reversed or altered.</p>
            </div>
            <div className="bg-secondary/30 rounded-xl p-4 border border-border/40">
              <h3 className="font-bold text-foreground mb-2">9.2 The Verification Process</h3>
              <p>For every game played, a <strong className="text-foreground">Server Seed</strong> is generated and its hash is committed before the bet is placed. By combining this with a <strong className="text-foreground">Client Seed</strong> provided by the user, the final outcome is determined. After the game, the Server Seed is revealed, allowing the user to verify the result against the original hash. Detailed technical steps can be found on our <Link href="/provably-fair" className="text-primary hover:underline">Provably Fair Page</Link>.</p>
            </div>
            <div className="bg-secondary/30 rounded-xl p-4 border border-border/40">
              <h3 className="font-bold text-foreground mb-2">9.3 No Manipulation</h3>
              <p>Because the hash is committed before the game begins, DGC Arcade has no way to change the outcome once the player places their bet. This ensures a 100% fair and transparent gaming environment.</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">10. Prohibited Activities</h2>
          <p>The following activities will result in immediate permanent account closure and forfeiture of all funds:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Using bots, scripts, or any automated means to interact with the Platform</li>
            <li>Exploiting software bugs or vulnerabilities — these must be reported immediately to support</li>
            <li>Money laundering, structuring, or any illegal financial activity</li>
            <li>Collusion with other players</li>
            <li>Creating multiple accounts (multi-accounting) or any form of bonus, referral, or affiliate abuse (see Sections 11 and 12)</li>
            <li>Chargeback fraud or disputing legitimate transactions (see Section 8)</li>
            <li>Using a VPN or proxy to access the Platform from a restricted jurisdiction</li>
            <li>Sharing your account credentials with any other person</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">11. Bonus and Promotion Abuse</h2>
          <p>DGC Arcade offers bonuses, promotions, and free play credits at its discretion. The following constitute <strong className="text-foreground">bonus abuse</strong> and will result in forfeiture of the bonus, associated winnings, and potential account closure:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li><strong className="text-foreground">Multi-accounting for bonuses:</strong> Creating or using more than one account to claim the same bonus, promotion, or welcome offer — including using different devices, IP addresses, email addresses, or payment methods to circumvent the one-account-per-person rule.</li>
            <li><strong className="text-foreground">Bonus wagering manipulation:</strong> Placing bets specifically designed to exploit bonus wagering requirements without genuine gameplay intent, including low-risk hedging strategies (betting both sides of an outcome, exploiting game mechanics with near-zero house edge to clear wagering requirements).</li>
            <li><strong className="text-foreground">Unauthorized bonus stacking:</strong> Combining bonuses in ways not explicitly permitted by the promotion terms.</li>
            <li><strong className="text-foreground">False eligibility claims:</strong> Misrepresenting your identity, location, or account status to qualify for a promotion you are not eligible for.</li>
            <li><strong className="text-foreground">Wagering requirement circumvention:</strong> Attempting to withdraw bonus-derived funds before meeting the stated wagering requirements.</li>
          </ul>
          <p className="mt-2">DGC Arcade uses automated detection and manual review to identify bonus abuse patterns. Suspected abuse may result in bonus forfeiture, account restriction, or permanent closure.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">12. Referral and Affiliate Program Abuse</h2>
          <p>The DGC Arcade Referral and Affiliate Program is subject to strict anti-abuse policies. The following activities are <strong className="text-foreground">explicitly prohibited</strong> and will result in commission forfeiture, account closure, and potential legal action:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li><strong className="text-foreground">Self-referrals:</strong> Using your own referral link — or a link controlled by you — to create new accounts that you control, operate, or fund, for the purpose of generating commission on your own activity.</li>
            <li><strong className="text-foreground">Multi-account referral rings:</strong> Creating or coordinating a network of accounts that refer each other in a circular or pyramid structure to generate artificial commission.</li>
            <li><strong className="text-foreground">Incentivized sign-ups:</strong> Paying, bribing, or coercing individuals to sign up using your referral link without their genuine intent to use the Platform.</li>
            <li><strong className="text-foreground">Fake traffic:</strong> Using bots, click farms, traffic exchanges, or any automated means to inflate click counts, sign-ups, or activity metrics associated with your referral link or campaign.</li>
            <li><strong className="text-foreground">Bot traffic:</strong> Generating or directing non-human traffic — including automated scripts, headless browsers, or purchased bot traffic — to your referral links or any Platform page.</li>
            <li><strong className="text-foreground">IP manipulation:</strong> Using VPNs, proxies, or shared IPs to disguise the origin of referred traffic and circumvent our duplicate-referral detection.</li>
            <li><strong className="text-foreground">Commission fraud:</strong> Any other method of artificially inflating commission, referral counts, or affiliate metrics, including coordinated deposit-and-withdraw cycles designed to generate commission without genuine wagering intent.</li>
          </ul>
          <p className="mt-2">DGC Arcade reserves the right to claw back commissions paid on fraudulent referrals at any time, including retroactively. Affiliates under investigation may have payouts suspended pending review.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">13. Creator Program Conduct</h2>
          <p>Specialty Creators accepted into the DGC Arcade Creator Program agree to the following additional obligations:</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li><strong className="text-foreground">Accurate representation:</strong> You must not make false, misleading, or exaggerated claims about DGC Arcade, including win rates, withdrawal times, or promotional offers, in any content you produce.</li>
            <li><strong className="text-foreground">Jurisdictional compliance:</strong> You are solely responsible for ensuring you only promote DGC Arcade to audiences in jurisdictions where online gambling is legal. Knowingly promoting to restricted jurisdictions will result in immediate creator account termination and commission forfeiture.</li>
            <li><strong className="text-foreground">No traffic manipulation:</strong> You must not use or direct fake traffic, bot traffic, or artificially inflated engagement toward any DGC Arcade link, campaign, or stream. This includes paid bot views, click farms, and view exchange networks.</li>
            <li><strong className="text-foreground">No self-play commission:</strong> Using your linked personal account or any account you control to generate commission on your own gameplay is strictly prohibited.</li>
            <li><strong className="text-foreground">Commission clawback:</strong> If we determine that commissions were generated through fraudulent, abusive, or prohibited activity, we reserve the right to deduct those amounts from your Creator Bank balance or future payouts.</li>
            <li><strong className="text-foreground">Program termination:</strong> DGC Arcade reserves the right to terminate any creator's participation in the program at any time, for any reason, with 7 days' notice. Upon termination, any earned and unpaid commissions will be paid out within 30 days provided no fraud investigation is pending.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">14. Responsible Gambling</h2>
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
          <h2 className="text-lg font-bold text-foreground mb-3">15. AI Fraud Monitoring</h2>
          <p>DGC Arcade uses an AI-powered fraud detection system that monitors all transactions in real time. This system automatically flags transactions that meet risk criteria including unusual velocity, large amounts, new account activity, and suspicious patterns. Flagged transactions are reviewed by our compliance team before processing. You consent to this monitoring by using the Platform.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">16. Limitation of Liability</h2>
          <p>DGC Arcade shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Platform. Our maximum liability to you in any matter shall not exceed the total amount you deposited in the 30-day period preceding the relevant claim. We are not liable for losses caused by your failure to secure your account credentials or by network failures outside our control.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">17. Governing Law and Disputes</h2>
          <p>These Terms are governed by applicable laws for the jurisdictions in which DGC Arcade operates. Any dispute shall first be addressed through our customer support process. Unresolved disputes shall be handled through the appropriate legal venue, except where mandatory local law requires otherwise.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">18. Changes to These Terms</h2>
          <p>We reserve the right to modify these Terms at any time. We will provide at least 14 days' notice of material changes via in-app notification or email. Continued use of the Platform after the effective date of changes constitutes your acceptance of the updated Terms. If you disagree with changes, you must close your account before the effective date.</p>
        </section>

      </div>
    </div>
  );
}
