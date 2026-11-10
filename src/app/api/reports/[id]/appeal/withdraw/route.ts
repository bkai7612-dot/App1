import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { notFound } from "@/lib/server/errors";

/** Owner withdraws an appeal before a moderator starts reviewing it; the report returns to its previous public state. */
export const POST = route({ auth: "mfa", rate: { name: "withdraw", limit: 20, windowSec: 3600 } }, async ({ auth, params, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  const ok = await withDb(SYSTEM, async (tx) => {
    const a = await tx.one<{ id: string }>(`UPDATE report_appeals SET status = 'withdrawn', decided_at = now() WHERE report_id = $1 AND appellant_user_id = $2 AND status = 'submitted' RETURNING id`, [id.data, auth!.user.id]);
    if (!a) return false;
    const responded = await tx.one(`SELECT 1 FROM report_responses WHERE report_id = $1 AND status IN ('pending','published')`, [id.data]);
    await tx.q(`UPDATE reports SET status = $2 WHERE id = $1 AND status = 'appealed'`, [id.data, responded ? "disputed" : "published"]);
    await audit(tx, auth!.user.id, "report.appeal_withdrawn", { type: "report", id: id.data }, { appeal: a.id }, meta.ipHash);
    return true;
  });
  if (!ok) throw notFound("There's no appeal waiting for review to withdraw.");
  return { ok: true };
});
