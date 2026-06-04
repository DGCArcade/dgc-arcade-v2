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
          <p className="text-muted-foreground text-sm">Last updated: June 2025</p>
        </div>
      </div>

      <div className="prose prose-invert max-w-none space-y-8 text-sm text-muted-foreground leading-relaxed">

        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-yellow-200 text-sm font-medium">
          ⚠️ You must be 18 years or older to use DGC Arcade. Gambling can be addictive — please play responsibly.
        </div>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">1. Company Information</h2>
          <p>
            DGC Arcade (the "Platform") is operated by <strong className="text-foreground">Medium Rare N.V.</strong>, a company incorporated under the laws of Curaçao, registered at Abraham de Veerstraat 9, Willemstad, Curaçao. Medium Rare N.V. holds a gaming license issued by the Curaçao Gaming Authority under <strong className="text-foreground">License No. 8048/JAZ</strong>.
          </p>
          <p className="mt-2">
            For support, contact us at: <strong className="text-foreground">support@dgcarcade.io</strong>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">2. Eligibility</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>You must be at least <strong className="text-foreground">18 years of age</strong> (or the legal gambling age in your jurisdiction, whichever is higher).</li>
            <li>You must not be located in a <strong className="text-foreground">Restricted Jurisdiction</strong>, including the United States of America, United Kingdom, France, Netherlands, Australia, and other jurisdictions where online gambling is prohibited.</li>
            <li>You must not be a politically exposed person (PEP) without prior written approval.</li>
            <li>Only one account per person is permitted. Multiple accounts will be suspended without notice.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">3. Account Registration</h2>
          <p>By registering, you confirm that all information provided is accurate, complete and up to date. You are solely responsible for maintaining the confidentiality of your login credentials. You must notify us immediately of any unauthorized use of your account.</p>
          <p className="mt-2">DGC Arcade reserves the right to request identity verification documents at any time in accordance with our KYC policy. Failure to provide requested documents may result in account suspension.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">4. Deposits & Withdrawals</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>All transactions are processed in cryptocurrency. DGC Arcade is not responsible for exchange rate fluctuations.</li>
            <li>Minimum deposit is $1.00 USD equivalent. Minimum withdrawal is $10.00 USD equivalent.</li>
            <li>Withdrawals are processed within 24 hours subject to verification requirements.</li>
            <li>DGC Arcade reserves the right to reverse any withdrawal pending the completion of an identity verification check.</li>
            <li>Bonuses are subject to a <strong className="text-foreground">30× wagering requirement</strong> before withdrawal unless otherwise stated.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">5. Provably Fair Gaming</h2>
          <p>All games on DGC Arcade use a provably fair algorithm. Each bet is generated using a combination of a server seed (hashed before the bet) and a client seed. After each bet, you can verify the fairness of any outcome using our provably fair verification tool.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">6. Prohibited Activities</h2>
          <p>The following activities are strictly prohibited and will result in immediate account termination and forfeiture of funds:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Using bots, scripts, or automated software</li>
            <li>Exploiting software bugs or glitches</li>
            <li>Money laundering or any illegal financial activity</li>
            <li>Collusion with other players</li>
            <li>Creating multiple accounts (bonus abuse)</li>
            <li>Chargeback fraud</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">7. Responsible Gambling</h2>
          <p>We are committed to responsible gambling. Tools available to you include deposit limits, session limits, cool-off periods, and self-exclusion. See our <Link href="/responsible-gambling" className="text-primary hover:underline">Responsible Gambling page</Link> for full details.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">8. Limitation of Liability</h2>
          <p>DGC Arcade shall not be liable for any indirect, incidental, special, or consequential damages arising from the use of the Platform. Our total liability to you in any matter shall not exceed the amount you deposited in the 30-day period preceding the claim.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">9. Governing Law</h2>
          <p>These Terms are governed by the laws of Curaçao. Any disputes shall be submitted to the exclusive jurisdiction of the courts of Curaçao, except where mandated otherwise by applicable law in your jurisdiction.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">10. Changes to Terms</h2>
          <p>We reserve the right to modify these Terms at any time. Continued use of the Platform after changes constitutes acceptance of the updated Terms. Material changes will be communicated via email or in-app notification.</p>
        </section>
      </div>
    </div>
  );
}
