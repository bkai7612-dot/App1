import { BadgeCheck, CircleHelp, CircleDashed, Link2Off, FlaskConical } from "lucide-react";

export const IDENTITY_META: Record<string, { label: string; desc: string; cls: string; Icon: typeof BadgeCheck }> = {
  verified: { label: "Verified", desc: "Ownership confirmed via an official sign-in or moderator review.", cls: "border-pos/40 bg-pos/10 text-pos", Icon: BadgeCheck },
  possible_match: { label: "Possible match", desc: "A moderator found supporting signals, but ownership is not confirmed.", cls: "border-amber-400/40 bg-amber-400/10 text-amber-300", Icon: CircleHelp },
  unverified: { label: "Unverified", desc: "Identified manually by username. Not confirmed as belonging to any person.", cls: "border-ink-line bg-white/[0.03] text-text-muted", Icon: CircleDashed },
  unlinked: { label: "Unlinked", desc: "This account was unlinked from the profile.", cls: "border-ink-line bg-white/[0.02] text-text-muted/70", Icon: Link2Off },
};

export function IdentityBadge({ status }: { status: string }) {
  const m = IDENTITY_META[status] ?? IDENTITY_META.unverified;
  return (
    <span className={`chip ${m.cls}`} title={m.desc}>
      <m.Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {m.label}
    </span>
  );
}

export function DemoBadge() {
  return (
    <span className="chip border-amber-400/50 bg-amber-400/10 text-amber-300" title="Fictional demonstration data. Not a real player.">
      <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" /> Demo data
    </span>
  );
}

export const REPORT_STATUS_META: Record<string, { label: string; publicLabel: string; cls: string }> = {
  submitted: { label: "Submitted", publicLabel: "Awaiting moderation", cls: "border-ink-line text-text-muted" },
  under_review: { label: "Under review", publicLabel: "Under review", cls: "border-sky-400/40 text-sky-300 bg-sky-400/10" },
  published: { label: "Published", publicLabel: "Allegation", cls: "border-orange-400/40 text-orange-300 bg-orange-400/10" },
  disputed: { label: "Disputed", publicLabel: "Disputed allegation", cls: "border-amber-400/40 text-amber-300 bg-amber-400/10" },
  appealed: { label: "Appealed", publicLabel: "Allegation under appeal", cls: "border-amber-400/40 text-amber-300 bg-amber-400/10" },
  resolved: { label: "Resolved", publicLabel: "Resolved moderation outcome", cls: "border-violet-brand/50 text-violet-lavender bg-violet-brand/10" },
  rejected: { label: "Rejected", publicLabel: "Rejected", cls: "border-ink-line text-text-muted" },
  removed: { label: "Removed", publicLabel: "Removed", cls: "border-ink-line text-text-muted" },
};

export function ReportStatusBadge({ status, audience = "public" }: { status: string; audience?: "public" | "internal" }) {
  const m = REPORT_STATUS_META[status] ?? REPORT_STATUS_META.submitted;
  return <span className={`chip ${m.cls}`}>{audience === "public" ? m.publicLabel : m.label}</span>;
}

export function PlatformStatusChip({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    verified_linking: ["Instant verification", "border-pos/40 text-pos bg-pos/10"],
    manual: ["Code check", "border-ink-line text-text-muted"],
    future: ["Future integration", "border-ink-line text-text-muted/70"],
  };
  const [label, cls] = map[status] ?? map.manual;
  return <span className={`chip ${cls}`}>{label}</span>;
}
