import Link from "next/link";

const LINKS = [
  { href: "/account", label: "General" },
  { href: "/account/security", label: "Security" },
  { href: "/account/privacy", label: "Privacy & data" },
];

export function AccountNav({ active }: { active: string }) {
  return (
    <nav className="mb-8 flex gap-1 border-b border-ink-line" aria-label="Account settings">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={active === l.href ? "page" : undefined}
          className={`px-4 py-3 text-sm ${active === l.href ? "nav-active" : "text-text-muted hover:text-text"}`}>{l.label}</Link>
      ))}
    </nav>
  );
}
