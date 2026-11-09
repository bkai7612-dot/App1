import { isPrelaunch } from "@/lib/launch-gates";
import { env } from "@/lib/env";

export function PrelaunchBanner() {
  if (isPrelaunch()) {
    return <div className="bg-amber-500/15 px-4 py-2 text-center text-xs text-amber-200">Pre-launch: some features are disabled until mandatory launch gates are approved.</div>;
  }
  if (env.launchMode !== "production") {
    return <div className="bg-violet-brand/15 px-4 py-1.5 text-center text-[11px] tracking-wide text-violet-lavender">{env.launchMode.toUpperCase()} ENVIRONMENT · contains fictional demonstration data · not for real use</div>;
  }
  return null;
}
