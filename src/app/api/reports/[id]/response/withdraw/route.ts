import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { notFound } from "@/lib/server/errors";

/** Owner withdraws their own response while it's still awaiting moderation (T-07). */
export const POST = route({ auth: "mfa", rate: { name: "withdraw", limit: 20, windowSec: 3600 } }, async ({ auth, params, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  const r = await withDb(SYSTEM, async (tx) => {
    const row = await tx.one<{ id: string }>(`UPDATE report_responses SET status = 'withdrawn' WHERE report_id = $1 AND author_user_id = $2 AND status = 'pending' RETURNING id`, [id.data, auth!.user.id]);
    if (!row) return null;
    await audit(tx, auth!.user.id, "report.response_withdrawn", { type: "report", id: id.data }, { response: row.id }, meta.ipHash);
    return row;
  });
  if (!r) throw notFound("There's no pending response to withdraw.");
  return { ok: true };
});
