"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, LogOut, Menu, Shield, X } from "lucide-react";
import { api } from "@/lib/client";

type L = { href: string; label: string };

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function NavLinks({ links }: { links: L[] }) {
  const path = usePathname();
  return (
    <ul className="hidden items-center gap-1 lg:flex">
      {links.map((l) => (
        <li key={l.href}>
          <Link href={l.href} aria-current={isActive(path, l.href) ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm transition hover:text-text ${isActive(path, l.href) ? "nav-active" : "text-text-muted"}`}>
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function logout(router: ReturnType<typeof useRouter>) {
  try { await api("/api/auth/logout", { body: {} }); } finally { router.push("/"); router.refresh(); }
}

export function UserMenu({ name, staff, links }: { name: string; staff: boolean; links: L[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, []);
  return (
    <div className="relative hidden md:block" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
        className="flex items-center gap-2 rounded-xl border border-ink-line bg-white/[0.03] px-3 py-2 text-sm hover:border-violet-brand/50">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-violet-brand to-fuchsia-500 text-[11px] font-bold">{name.slice(0, 1).toUpperCase()}</span>
        <span className="max-w-[9rem] truncate">{name}</span>
        <ChevronDown className="h-4 w-4 text-text-muted" />
      </button>
      {open && (
        <div role="menu" className="glass absolute right-0 mt-2 w-60 p-2">
          {links.map((l) => (
            <Link role="menuitem" key={l.href} href={l.href} className="block rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-white/5 hover:text-text">{l.label}</Link>
          ))}
          {staff && (
            <Link role="menuitem" href="/admin" className="mt-1 flex items-center gap-2 rounded-lg border-t border-ink-line px-3 py-2 text-sm text-violet-lavender hover:bg-white/5">
              <Shield className="h-4 w-4" /> Moderation dashboard
            </Link>
          )}
          <button role="menuitem" onClick={() => logout(router)} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-muted hover:bg-white/5 hover:text-text">
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

export function MobileMenu({ links, accountLinks, staff }: { links: L[]; accountLinks: L[] | null; staff: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const path = usePathname();
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    if (!open) return;
    const el = panel.current;
    el?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); opener.current?.focus(); return; }
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>("a, button"));
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const overlay = open && (
    // Rendered in a portal on <body>: the header's backdrop-filter would otherwise clip a fixed overlay.
    <div ref={panel} className="fixed inset-0 z-[80] bg-ink lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="flex h-16 items-center justify-end px-4">
        <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-text-muted hover:bg-white/5" aria-label="Close menu"><X className="h-6 w-6" /></button>
      </div>
      <div className="max-h-[calc(100vh-4rem)] overflow-y-auto px-6 pb-10">
        <ul className="space-y-1">
          {links.map((l) => (
            <li key={l.href}><Link href={l.href} className={`block rounded-xl px-4 py-3 text-lg ${isActive(path, l.href) ? "bg-violet-brand/15 text-text" : "text-text-muted"}`}>{l.label}</Link></li>
          ))}
        </ul>
        <div className="my-6 h-px bg-ink-line" />
        {accountLinks ? (
          <ul className="space-y-1">
            {accountLinks.map((l) => (
              <li key={l.href}><Link href={l.href} className="block rounded-xl px-4 py-2.5 text-text-muted">{l.label}</Link></li>
            ))}
            {staff && <li><Link href="/admin" className="block rounded-xl px-4 py-2.5 text-violet-lavender">Moderation dashboard</Link></li>}
            <li><button onClick={() => logout(router)} className="block w-full rounded-xl px-4 py-2.5 text-left text-text-muted">Log out</button></li>
          </ul>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Link href="/login" className="btn-ghost">Log in</Link>
            <Link href="/register" className="btn-primary">Register</Link>
          </div>
        )}
      </div>
    </div>
  );
  return (
    <div className="lg:hidden">
      <button ref={opener} onClick={() => setOpen(true)} className="rounded-lg p-2 text-text-muted hover:bg-white/5" aria-label="Open menu" aria-expanded={open}>
        <Menu className="h-6 w-6" />
      </button>
      {mounted && overlay ? createPortal(overlay, document.body) : null}
    </div>
  );
}
