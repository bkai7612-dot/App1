"use client";
import { useEffect, useRef } from "react";

/** P-05: horizontally scrolls the strip so the current tab (aria-current) is visible on narrow screens. */
export function TabStrip({ className, label, children, active }: { className: string; label: string; children: React.ReactNode; active: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (el && ref.current) ref.current.scrollTo({ left: el.offsetLeft - ref.current.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [active]);
  return <nav ref={ref} className={className} aria-label={label}>{children}</nav>;
}
