import Link from "next/link";
import { Lock, Check } from "lucide-react";
import { CheckoutButton } from "./CheckoutButton";

export function PremiumLock({ title, text, returnTo, signedIn }: { title: string; text: string; returnTo: string; signedIn: boolean }) {
  return (
    <section className="iris-border iris-glow glass relative overflow-hidden p-6 sm:p-10" aria-labelledby="lock-h">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-6 top-6 space-y-3 opacity-40 blur-[3px]">
        {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-white/[0.04]" />)}
      </div>
      <div className="relative mx-auto max-w-lg text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-brand/20 text-violet-lavender"><Lock className="h-6 w-6" /></span>
        <h2 id="lock-h" className="mt-4 font-display text-2xl font-semibold">{title}</h2>
        <p className="mt-2 text-text-muted">{text}</p>
        <p className="mt-5 font-display text-4xl font-semibold"><span className="iris-text">£0.99</span><span className="text-base font-normal text-text-muted">/month</span></p>
        <ul className="mx-auto mt-5 max-w-sm space-y-2 text-left text-sm text-text-muted">
          {["Approved commendation comments", "Moderated report summaries and categories", "Feedback dates, dispute and resolution status", "Month-by-month reputation history"].map((f) => (
            <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-pos" />{f}</li>
          ))}
        </ul>
        <div className="mt-6">
          {signedIn ? <CheckoutButton returnTo={returnTo} label="Upgrade to ServerSentry Plus" /> :
            <Link href={`/login?next=${encodeURIComponent(returnTo)}`} className="btn-primary px-6 py-3">Sign in to upgrade to ServerSentry Plus</Link>}
        </div>
        <p className="mt-4 text-xs text-text-muted">Cancel any time. Plus never gives access to private evidence, unmoderated reports or reporter identities, and nobody can pay to change feedback.</p>
      </div>
    </section>
  );
}
