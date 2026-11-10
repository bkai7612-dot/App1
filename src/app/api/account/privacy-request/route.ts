import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { audit } from "@/lib/server/audit";

const Body = z.object({
  kind: z.enum(["access", "rectification", "erasure", "restriction", "objection", "portability", "complaint"]),
  details: z.string().trim().min(10).max(4000),
  targetType: z.enum(["report", "report_about_me", "commendation", "player_comment", "player_profile", "gaming_account", "account"]).optional(),
  targetRef: z.string().trim().max(300).optional(),
}).strict();

export const POST = route({ auth: "auth", body: Body, rate: { name: "dsr", limit: 5, windowSec: 86400 } }, async ({ auth, body, meta }) => {
  const r = await withDb(auth!.db, async (tx) => {
    const row = await tx.one<{ id: string; due_at: Date }>(`INSERT INTO data_subject_requests (user_id, kind, details, target_type, target_ref) VALUES ($1, $2, $3, $4, $5) RETURNING id, due_at`, [auth!.user.id, body.kind, body.details, body.targetType ?? null, body.targetRef || null]);
    await audit(tx, auth!.user.id, "privacy.request_submitted", { type: "data_subject_request", id: row!.id }, { kind: body.kind }, meta.ipHash);
    return row!;
  });
  return { ok: true, id: r.id, dueAt: r.due_at };
});
