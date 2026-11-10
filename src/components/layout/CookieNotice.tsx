"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * ServerSentry currently sets ONLY strictly necessary cookies (session, this notice's preference),
 * which PECR exempts from consent. If optional analytics are ever added, they must be gated on
 * `ss_consent=optional` and default OFF. See /cookies for the inventory.
 */
export function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(!document.cookie.split("; ").some((c) => c.startsWith("ss_consent=")));
  }, []);
  if (!show) return null;
  const set = (v: string) => {
    document.cookie = `ss_consent=${v}; Path=/; Max-Age=${60 * 60 * 24 * 180}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setShow(false);
  };
  // P-01: a slim bar in the page flow (not floating over content), reached early in the tab order.
  return (
    <div role="region" aria-label="Cookie notice" className="relative z-[2] border-b border-ink-line bg-ink/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-1.5 text-xs">
        <p className="text-text-muted">We use essential cookies only. No tracking or ads. <Link href="/cookies" className="text-violet-lavender underline">Details</Link></p>
        <button onClick={() => set("essential")} className="btn-ghost ml-auto shrink-0 px-3 py-1 text-xs">OK</button>
      </div>
    </div>
  );
}
