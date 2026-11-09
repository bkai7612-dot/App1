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
  return (
    <div role="region" aria-label="Cookie notice" className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-xl">
      <div className="glass flex items-center gap-3 p-3 text-xs sm:p-4 sm:text-sm">
        <p className="text-text-muted">Essential cookies only, no tracking. <Link href="/cookies" className="text-violet-lavender underline">Cookie details</Link></p>
        <button onClick={() => set("essential")} className="btn-primary shrink-0">OK</button>
      </div>
    </div>
  );
}
