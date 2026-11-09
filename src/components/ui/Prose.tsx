import type { ReactNode } from "react";

export function Prose({ title, intro, children, draft = false }: { title: string; intro?: ReactNode; children: ReactNode; draft?: boolean }) {
  return (
    <div className="ambient">
      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {intro && <p className="mt-3 text-text-muted">{intro}</p>}
        {draft && <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">Draft for specialist legal review before public launch. This document has not been reviewed by a solicitor.</p>}
        <div className="mt-8 space-y-6 text-[15px] leading-7 text-text/90 [&_a]:text-violet-lavender [&_a]:underline [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-text [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5 [&_table]:w-full [&_td]:border-t [&_td]:border-ink-line [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top [&_th]:pb-2 [&_th]:pr-3 [&_th]:text-left [&_th]:text-xs [&_th]:uppercase [&_th]:text-text-muted">
          {children}
        </div>
      </article>
    </div>
  );
}
