import { Link } from "wouter";
import { ChevronLeft, FileText } from "lucide-react";

export default function AmlPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> Home
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-8">
        <FileText className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-3xl font-display font-black uppercase tracking-tight">AML & KYC Policy</h1>
          <p className="text-muted-foreground text-sm">Anti-Money Laundering & Know Your Customer</p>
        </div>
      </div>

      <div className="prose prose-invert max-w-none space-y-8 text-sm text-muted-foreground leading-relaxed">

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">1. Overview</h2>
          <p>DGC Arcade Ltd., operating DGC Arcade as a licensed gaming platform, maintains strict Anti-Money Laundering (AML) and Know Your Customer (KYC) policies in compliance with applicable international regulations. We are committed to preventing the use of our Platform for money laundering, terrorist financing, or any other illegal financial activity.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">2. Know Your Customer (KYC)</h2>
          <p>KYC verification may be required before processing withdrawals or at any time at our discretion. Verification documents required include:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-foreground">Proof of Identity:</strong> Government-issued photo ID (passport, national ID card, or driver's license)</li>
            <li><strong className="text-foreground">Proof of Address:</strong> Utility bill, bank statement, or official government letter dated within 3 months</li>
            <li><strong className="text-foreground">Selfie Verification:</strong> A photo of you holding your ID and a handwritten note with the date</li>
            <li><strong className="text-foreground">Source of Funds:</strong> For large transactions, documentation demonstrating the legal origin of funds</li>
          </ul>
          <p className="mt-2">Documents must be high-quality, unedited, and show all four corners of the document. We process KYC verifications within 24–72 hours.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">3. KYC Thresholds</h2>
          <div className="bg-secondary/30 rounded-xl overflow-hidden not-prose">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-muted-foreground uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Action</th>
                  <th className="px-4 py-3 text-left font-medium">Threshold</th>
                  <th className="px-4 py-3 text-left font-medium">Level Required</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {[
                  ["Withdrawal", "Any amount", "Basic KYC"],
                  ["Large Withdrawal", "> $2,000", "Enhanced KYC"],
                  ["High Volume", "> $10,000 / month", "Source of Funds"],
                  ["VIP Status", "> $50,000 lifetime", "Full KYC + Enhanced Due Diligence"],
                ].map(([action, threshold, level]) => (
                  <tr key={action}>
                    <td className="px-4 py-3 text-foreground font-medium">{action}</td>
                    <td className="px-4 py-3">{threshold}</td>
                    <td className="px-4 py-3 text-primary font-medium">{level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">4. Anti-Money Laundering (AML)</h2>
          <p>We monitor all transactions for suspicious activity. Our AML program includes:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Automated transaction monitoring for unusual patterns</li>
            <li>Screening against international sanctions lists (OFAC, EU, UN)</li>
            <li>Politically Exposed Person (PEP) screening</li>
            <li>Enhanced due diligence for high-value or high-risk accounts</li>
            <li>Suspicious Activity Reports (SARs) filed with relevant authorities where required</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">5. Prohibited Jurisdictions</h2>
          <p>We do not accept players from jurisdictions where online gambling is prohibited, including but not limited to: United States of America, United Kingdom, France, Netherlands (Antilles), Australia, Belgium, Czech Republic, Denmark, Germany, Italy, Romania, Spain, Sweden, and Switzerland.</p>
          <p className="mt-2">We reserve the right to update this list without notice and to suspend or terminate accounts found to be accessing the Platform from restricted jurisdictions.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">6. Record Keeping</h2>
          <p>We maintain records of all transactions and identity documents for a minimum of 7 years in compliance with applicable gaming regulations and international AML standards.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">7. Contact</h2>
          <p>For KYC verification enquiries: <strong className="text-foreground">kyc@dgcarcade.io</strong><br />
          For AML/compliance matters: <strong className="text-foreground">compliance@dgcarcade.io</strong></p>
        </section>
      </div>
    </div>
  );
}
