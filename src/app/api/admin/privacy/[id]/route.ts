import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { notFound } from "@/lib/server/errors";

const Body = z.object({ status: z.enum(["in_progress", "completed", "refused"]), note: z.string().trim().min(5).max(4000) }).strict();

export const POST = route({ permission: "privacy.requests.manage", body: Body }, async ({ auth, params, body, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  return withDb(auth!.db, async (tx) => {
    const r = await tx.one<{ id: string; user_id: string | null }>(
      `UPDATE data_subject_requests SET status = $2, response_note = $3, handled_by = $4, closed_at = CASE WHEN $2 IN ('completed','refused') THEN now() ELSE NULL END
       WHERE id = $1 RETURNING id, user_id`, [id.data, body.status, body.note, auth!.user.id]);
    if (!r) throw notFound();
    await audit(tx, auth!.user.id, `privacy.request_${body.status}`, { type: "data_subject_request", id: r.id }, {}, meta.ipHash);
    if (r.user_id) await notify(tx, r.user_id, "security", `Your privacy request is ${body.status.replace("_", " ")}`, body.note.slice(0, 300), "/account/privacy");
    return { ok: true };
  });
});
