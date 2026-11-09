import Link from "next/link";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-white/[0.06] bg-ink-2/60">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-text-muted">
            Community-powered gaming reputation. Published reports are moderated community allegations, not findings of fact, unless marked as a resolved moderation outcome.
          </p>
        </div>
        <div>
          <p className="label">Platform</p>
          <ul className="space-y-2 text-sm text-text-muted">
            <li><Link href="/search" className="hover:text-text">Search players</Link></li>
            <li><Link href="/how-it-works" className="hover:text-text">How it works</Link></li>
            <li><Link href="/pricing" className="hover:text-text">Pricing</Link></li>
            <li><Link href="/guidelines" className="hover:text-text">Community guidelines</Link></li>
          </ul>
        </div>
        <div>
          <p className="label">Legal & privacy</p>
          <ul className="space-y-2 text-sm text-text-muted">
            <li><Link href="/terms" className="hover:text-text">Terms of use</Link></li>
            <li><Link href="/privacy" className="hover:text-text">Privacy notice</Link></li>
            <li><Link href="/cookies" className="hover:text-text">Cookies</Link></li>
            <li><Link href="/complaints" className="hover:text-text">Complaints & content removal</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/[0.05] py-5 text-center text-xs text-text-muted/70">© {new Date().getFullYear()} ServerSentry. Not affiliated with any game publisher or platform.</div>
    </footer>
  );
}
