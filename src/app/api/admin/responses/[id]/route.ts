import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { audit, moderationAction } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { badRequest, notFound } from "@/lib/server/errors";

const Body = z.object({ decision: z.enum(["publish", "reject"]), note: z.string().trim().max(1000).optional() }).strict();

export const POST = route({ permission: "mod.responses.review", body: Body }, async ({ auth, params, body, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  return withDb(auth!.db, async (tx) => {
    const r = await tx.one<{ id: string; status: string; report_id: string; author_user_id: string | null }>(`SELECT id, status, report_id, author_user_id FROM report_responses WHERE id = $1 FOR UPDATE`, [id.data]);
    if (!r) throw notFound();
    if (r.status !== "pending") throw badRequest("Already moderated.");
    const to = body.decision === "publish" ? "published" : "rejected";
    await tx.q(`UPDATE report_responses SET status = $2, moderated_by = $3, moderated_at = now() WHERE id = $1`, [r.id, to, auth!.user.id]);
    await moderationAction(tx, auth!.user.id, { type: "report_response", id: r.id }, `response_${body.decision}`, "pending", to, body.note ?? null);
    await audit(tx, auth!.user.id, `moderation.response.${body.decision}`, { type: "report_response", id: r.id }, {}, meta.ipHash);
    if (r.author_user_id) await notify(tx, r.author_user_id, "report_disputed", body.decision === "publish" ? "Your response was published" : "Your response was not published", body.note?.slice(0, 200), "/me/reports");
    return { ok: true };
  });
});
