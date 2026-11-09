import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { audit } from "@/lib/server/audit";

const Body = z.object({
  kind: z.enum(["access", "rectification", "erasure", "restriction", "objection", "portability", "complaint"]),
  details: z.string().trim().min(10).max(4000),
}).strict();

export const POST = route({ auth: "auth", body: Body, rate: { name: "dsr", limit: 5, windowSec: 86400 } }, async ({ auth, body, meta }) => {
  const r = await withDb(auth!.db, async (tx) => {
    const row = await tx.one<{ id: string; due_at: Date }>(`INSERT INTO data_subject_requests (user_id, kind, details) VALUES ($1, $2, $3) RETURNING id, due_at`, [auth!.user.id, body.kind, body.details]);
    await audit(tx, auth!.user.id, "privacy.request_submitted", { type: "data_subject_request", id: row!.id }, { kind: body.kind }, meta.ipHash);
    return row!;
  });
  return { ok: true, id: r.id, dueAt: r.due_at };
});
