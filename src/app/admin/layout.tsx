import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LayoutDashboard, Flag, ListChecks, Users, ScrollText, ShieldQuestion } from "lucide-react";
import { requirePageAuth } from "@/lib/server/page-auth";
import { can, isStaff, isAdminRole, ROLE_LABELS } from "@/lib/rbac";
import { Notice } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Moderation", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await requirePageAuth("/admin");
  // Non-staff get a 404 (do not reveal the admin surface exists).
  if (!isStaff(auth.user.role)) notFound();
  if (!auth.staffActive) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <Notice tone="warn">
          Staff permissions require a session verified with two-factor authentication{isAdminRole(auth.user.role) ? " using a passkey or security key" : ""}.
          <Link href="/account/security" className="ml-1 underline">Set up or use your passkey</Link>, then sign out and back in.
        </Notice>
      </div>
    );
  }
  const r = auth.user.role;
  const links = [
    { href: "/admin", label: "Overview", Icon: LayoutDashboard, show: true },
    { href: "/admin/reports", label: "Reports", Icon: Flag, show: can(r, "mod.reports.review") },
    { href: "/admin/queue", label: "Other queues", Icon: ListChecks, show: can(r, "mod.commendations.review") },
    { href: "/admin/users", label: "Users", Icon: Users, show: can(r, "users.view") },
    { href: "/admin/privacy", label: "Privacy & recovery", Icon: ShieldQuestion, show: can(r, "privacy.requests.manage") },
    { href: "/admin/audit", label: "Audit log", Icon: ScrollText, show: can(r, "audit.view") },
  ].filter((l) => l.show);
  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[220px_1fr]">
      <aside className="glass h-fit p-3 lg:sticky lg:top-24">
        <p className="px-3 pb-2 pt-1 text-xs uppercase tracking-wider text-text-muted">{ROLE_LABELS[r]}</p>
        <nav aria-label="Moderation"><ul className="flex gap-1 overflow-x-auto lg:flex-col">
          {links.map((l) => <li key={l.href}><Link href={l.href} className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-white/5 hover:text-text"><l.Icon className="h-4 w-4" />{l.label}</Link></li>)}
        </ul></nav>
        <p className="mt-3 px-3 text-[11px] text-text-muted">Privileged session · expires after 30 min idle. All actions are audit-logged.</p>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
