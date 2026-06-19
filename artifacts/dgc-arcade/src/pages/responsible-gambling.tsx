import { Link } from "wouter";
import { ChevronLeft, Heart } from "lucide-react";

export default function ResponsibleGamblingPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> Home
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-8">
        <Heart className="w-8 h-8 text-red-400" />
        <div>
          <h1 className="text-3xl font-display font-black uppercase tracking-tight">Responsible Gambling</h1>
          <p className="text-muted-foreground text-sm">Your wellbeing comes first.</p>
        </div>
      </div>

      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 mb-8">
        <div className="text-red-300 font-bold mb-2 text-base">🆘 Need help right now?</div>
        <div className="text-sm text-muted-foreground space-y-1">
          <p><strong className="text-foreground">National Problem Gambling Helpline (US):</strong> 1-800-522-4700</p>
          <p><strong className="text-foreground">GamCare (UK):</strong> 0808 8020 133 | <a href="https://www.gamcare.org.uk" target="_blank" rel="noopener" className="text-primary hover:underline">gamcare.org.uk</a></p>
          <p><strong className="text-foreground">Gamblers Anonymous:</strong> <a href="https://www.gamblersanonymous.org" target="_blank" rel="noopener" className="text-primary hover:underline">gamblersanonymous.org</a></p>
          <p><strong className="text-foreground">BeGambleAware:</strong> <a href="https://www.begambleaware.org" target="_blank" rel="noopener" className="text-primary hover:underline">begambleaware.org</a></p>
        </div>
      </div>

      <div className="prose prose-invert max-w-none space-y-8 text-sm text-muted-foreground leading-relaxed">

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">Our Commitment</h2>
          <p>DGC Arcade is operated by DGC Arcade Ltd. and licensed by the Curaçao Gaming Authority. We are committed to providing a safe and responsible gambling environment. Gambling should always be entertaining — never a way to make money or escape problems.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">Are You Gambling Responsibly?</h2>
          <p>Ask yourself the following questions. If you answer "yes" to several of them, you may have a gambling problem:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Do you gamble more than you can afford to lose?</li>
            <li>Do you borrow money to gamble?</li>
            <li>Has gambling affected your relationships, work, or health?</li>
            <li>Do you feel anxious or irritable when not gambling?</li>
            <li>Do you chase losses — betting more to try to recover?</li>
            <li>Do you hide your gambling from family or friends?</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">Tools We Provide</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 not-prose">
            {[
              { icon: "💰", title: "Deposit Limits", desc: "Set daily, weekly, or monthly deposit limits to control your spending." },
              { icon: "⏱️", title: "Session Time Limits", desc: "Set a maximum session length. We'll alert you when your time is up." },
              { icon: "❄️", title: "Cool-Off Period", desc: "Take a break from gambling for 24 hours, 7 days, or 30 days." },
              { icon: "🚫", title: "Self-Exclusion", desc: "Permanently exclude yourself from the Platform. Contact support to activate." },
            ].map(tool => (
              <div key={tool.title} className="bg-secondary/30 rounded-xl p-4 border border-border/40">
                <div className="text-2xl mb-2">{tool.icon}</div>
                <div className="font-bold text-foreground text-sm mb-1">{tool.title}</div>
                <div className="text-xs text-muted-foreground">{tool.desc}</div>
              </div>
            ))}
          </div>
          <p className="mt-4">To access any of these tools, go to your <Link href="/profile" className="text-primary hover:underline">Profile Settings</Link> or contact our support team.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">Tips for Responsible Play</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Set a budget before you play and stick to it</li>
            <li>Treat gambling as entertainment, not a source of income</li>
            <li>Never gamble when you are emotional, stressed, or under the influence</li>
            <li>Take regular breaks — set a timer</li>
            <li>Don't chase losses</li>
            <li>Balance gambling with other activities and hobbies</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-foreground mb-3">Minor Protection</h2>
          <p>DGC Arcade is strictly for players aged 18 and over. We use age verification procedures to prevent access by minors. If you share a device with someone under 18, we recommend installing parental control software such as <a href="https://www.gamcare.org.uk/get-support/talk-to-us-online/" target="_blank" rel="noopener" className="text-primary hover:underline">Net Nanny</a> or <a href="https://www.cyberpatrol.com" target="_blank" rel="noopener" className="text-primary hover:underline">CyberPatrol</a>.</p>
        </section>
      </div>
    </div>
  );
}
