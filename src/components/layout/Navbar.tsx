import Link from "next/link";
import { Bell } from "lucide-react";
import { getAuth } from "@/lib/auth/session";
import { withDb } from "@/lib/db";
import { isStaff } from "@/lib/rbac";
import { Logo } from "./Logo";
import { NavLinks, MobileMenu, UserMenu } from "./NavClient";

export const PUBLIC_LINKS = [
  { href: "/", label: "Home" },
  { href: "/search", label: "Search Players" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/guidelines", label: "Community Guidelines" },
  { href: "/pricing", label: "Pricing" },
];

export const ACCOUNT_LINKS = [
  { href: "/me/profile", label: "My Profile" },
  { href: "/me/reports", label: "My Reports" },
  { href: "/me/commendations", label: "My Commendations" },
  { href: "/me/linked-accounts", label: "Linked Accounts" },
  { href: "/me/subscription", label: "Subscription" },
  { href: "/account", label: "Account Settings" },
];

export async function Navbar() {
  const auth = await getAuth();
  let unread = 0;
  if (auth && !auth.pendingMfa) {
    const r = await withDb(auth.db, (tx) => tx.one<{ n: string }>(`SELECT count(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [auth.user.id]));
    unread = Number(r?.n ?? 0);
  }
  const user = auth && !auth.pendingMfa ? { name: auth.user.displayName, staff: isStaff(auth.user.role) } : null;
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-ink/75 backdrop-blur-xl">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="shrink-0" aria-label="ServerSentry home"><Logo /></Link>
        <NavLinks links={PUBLIC_LINKS} />
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link href="/me/notifications" className="relative rounded-lg p-2 text-text-muted hover:bg-white/5 hover:text-text" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
                <Bell className="h-5 w-5" />
                {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-violet-electric px-1 text-[10px] font-bold">{unread > 9 ? "9+" : unread}</span>}
              </Link>
              <UserMenu name={user.name} staff={user.staff} links={ACCOUNT_LINKS} />
            </>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Link href="/login" className="btn-ghost">Log in</Link>
              <Link href="/register" className="btn-primary">Register</Link>
            </div>
          )}
          <MobileMenu links={PUBLIC_LINKS} accountLinks={user ? ACCOUNT_LINKS : null} staff={!!user?.staff} />
        </div>
      </nav>
    </header>
  );
}
