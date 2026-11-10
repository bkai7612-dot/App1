import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { badRequest, notFound } from "@/lib/server/errors";

const Body = z.object({ text: z.string().trim().min(10).max(2000) }).strict();

/** Reporter supplies additional information requested by a moderator (appended to the private moderation record). */
export const POST = route({ auth: "mfa", body: Body, rate: { name: "report-info", limit: 10, windowSec: 86400 } }, async ({ auth, params, body, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  const r = await withDb(auth!.db, (tx) => tx.one<{ id: string; status: string; info_requested_at: Date | null }>(
    `SELECT id, status, info_requested_at FROM reports WHERE id = $1 AND reporter_user_id = $2`, [id.data, auth!.user.id]));
  if (!r) throw notFound();
  if (!r.info_requested_at || r.status !== "under_review") throw badRequest("No information was requested for this report.");
  await withDb(SYSTEM, async (tx) => {
    await tx.q(`INSERT INTO moderation_actions (moderator_id, target_type, target_id, action, note) VALUES (NULL, 'report', $1, 'reporter_info_supplied', $2)`, [r.id, body.text]);
    await tx.q(`UPDATE reports SET info_requested_at = NULL, info_replied_at = now() WHERE id = $1`, [r.id]);
    await audit(tx, auth!.user.id, "report.info_supplied", { type: "report", id: r.id }, {}, meta.ipHash);
  });
  return { ok: true };
});
