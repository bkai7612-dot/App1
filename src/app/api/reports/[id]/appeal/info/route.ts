import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { badRequest, notFound } from "@/lib/server/errors";

const Body = z.object({ text: z.string().trim().min(5).max(2000) }).strict();

/** Appellant answers a moderator's question about their appeal (M-11). */
export const POST = route({ auth: "mfa", body: Body, rate: { name: "appeal-info", limit: 10, windowSec: 86400 } }, async ({ auth, params, body, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  const a = await withDb(SYSTEM, (tx) => tx.one<{ id: string }>(
    `UPDATE report_appeals SET info_reply = $3, info_replied_at = now()
     WHERE report_id = $1 AND appellant_user_id = $2 AND status IN ('submitted','under_review') AND info_requested_at IS NOT NULL AND info_replied_at IS NULL RETURNING id`,
    [id.data, auth!.user.id, body.text]));
  if (!a) throw badRequest("There's no open question about your appeal.");
  await withDb(auth!.db, (tx) => audit(tx, auth!.user.id, "report.appeal_info_supplied", { type: "report_appeal", id: a.id }, {}, meta.ipHash));
  return { ok: true };
});
