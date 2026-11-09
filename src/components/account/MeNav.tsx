import Link from "next/link";
import { ACCOUNT_LINKS } from "@/components/layout/Navbar";

export function MeNav({ active }: { active: string }) {
  return (
    <nav className="mb-8 flex gap-1 overflow-x-auto border-b border-ink-line" aria-label="My account">
      {ACCOUNT_LINKS.filter((l) => l.href.startsWith("/me")).map((l) => (
        <Link key={l.href} href={l.href} aria-current={active === l.href ? "page" : undefined}
          className={`whitespace-nowrap px-4 py-3 text-sm ${active === l.href ? "nav-active" : "text-text-muted hover:text-text"}`}>{l.label}</Link>
      ))}
    </nav>
  );
}
