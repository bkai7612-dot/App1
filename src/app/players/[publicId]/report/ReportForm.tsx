"use client";
import Link from "next/link";
import { useState } from "react";
import { ShieldCheck, Upload } from "lucide-react";
import { ClientApiError } from "@/lib/client";
import { REPORT_LABELS } from "@/lib/categories";
import { GateError } from "@/components/feedback/MfaGateMessage";

export function ReportForm({ profileId, publicId }: { profileId: string; publicId: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const today = new Date().toISOString().slice(0, 10);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const fd = new FormData(e.currentTarget);
    fd.delete("evidence");
    files.forEach((f) => fd.append("evidence", f));
    fd.set("playerProfileId", profileId);
    fd.set("accurateConfirm", (e.currentTarget.elements.namedItem("confirm") as HTMLInputElement).checked ? "true" : "false");
    try {
      const res = await fetch("/api/reports", { method: "POST", body: fd, headers: { "x-ss-csrf": "1" }, credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ClientApiError(res.status, data?.error?.code ?? "ERROR", data?.error?.message ?? "Could not submit report.");
      setDone(data.ref);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  if (done) return (
    <div className="glass p-8 text-center">
      <ShieldCheck className="mx-auto h-10 w-10 text-violet-lavender" />
      <h2 className="mt-3 font-display text-xl font-semibold">Report submitted</h2>
      <p className="mt-2 text-sm text-text-muted">Reference <span className="font-mono">{done}</span>. A moderator will review it. You can follow its status in <Link className="underline" href="/me/reports">My Reports</Link>.</p>
      <Link href={`/players/${publicId}`} className="btn-ghost mt-5">Back to profile</Link>
    </div>
  );
  return (
    <form onSubmit={submit} className="glass space-y-5 p-6">
      <label className="block"><span className="label">Category</span>
        <select name="category" required className="input">{Object.entries(REPORT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <label className="block"><span className="label">Approximate incident date</span>
        <input type="date" name="incidentDate" required max={today} className="input" />
      </label>
      <label className="block"><span className="label">What happened?</span>
        <textarea name="description" required minLength={20} maxLength={4000} rows={7} className="input" placeholder="Describe what you experienced, factually. Stick to what you saw or heard in-game." />
        <span className="mt-1 block text-xs text-text-muted">Private to moderators. 20–4000 characters.</span>
      </label>
      <div>
        <span className="label">Supporting evidence (optional)</span>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-ink-line px-4 py-4 text-sm text-text-muted hover:border-violet-brand/50">
          <Upload className="h-5 w-5" />
          <span>{files.length ? files.map((f) => f.name).join(", ") : "Up to 3 screenshots (PNG, JPEG, WebP · max 5 MB each)"}</span>
          <input type="file" name="evidence" accept="image/png,image/jpeg,image/webp" multiple className="sr-only"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))} />
        </label>
        <span className="mt-1 block text-xs text-text-muted">Evidence is stored privately, stripped of metadata and only seen by moderators. It is never published.</span>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="confirm" required className="mt-1 h-4 w-4 accent-violet-500" />
        <span>I confirm this report is accurate to the best of my knowledge and follows the <Link href="/guidelines" className="underline">Community Guidelines</Link>.</span>
      </label>
      <GateError error={err} />
      <button disabled={busy} className="btn-primary w-full">{busy && <span className="spinner" />}Submit report for moderation</button>
    </form>
  );
}
