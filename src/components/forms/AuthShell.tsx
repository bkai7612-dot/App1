import type { ReactNode } from "react";
import { WaveBackground } from "@/components/layout/WaveBackground";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative overflow-hidden">
      <WaveBackground intensity="soft" />
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-10rem)] max-w-md flex-col justify-center px-4 py-12">
        <div className="iris-border glass p-7 sm:p-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
