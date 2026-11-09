import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { badRequest, conflict, forbidden, notFound } from "@/lib/server/errors";

const Body = z.object({ grounds: z.string().trim().min(20).max(4000) });

/** Appeal a published report (verified profile owner only; free). */
export const POST = route({ auth: "mfa", body: Body, rate: { name: "report-appeal", limit: 5, windowSec: 86400 } }, async ({ auth, body, params, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  const target = await withDb(SYSTEM, (tx) => tx.one<{ id: string; status: string; owner_user_id: string | null }>(
    `SELECT r.id, r.status, p.owner_user_id FROM public_reports r JOIN player_profiles p ON p.id = r.player_profile_id WHERE r.id = $1`, [id.data]));
  if (!target) throw notFound();
  if (target.owner_user_id !== auth!.user.id) throw forbidden("Only the verified owner of this profile can appeal.");
  if (target.status === "resolved") throw badRequest("This report has a final moderation outcome. Use the complaints process if you believe it is wrong.");
  await withDb(auth!.db, async (tx) => {
    const open = await tx.one(`SELECT 1 FROM report_appeals WHERE report_id = $1 AND status IN ('submitted','under_review')`, [target.id]);
    if (open) throw conflict("An appeal is already being reviewed.");
    const a = await tx.one<{ id: string }>(`INSERT INTO report_appeals (report_id, appellant_user_id, grounds) VALUES ($1, $2, $3) RETURNING id`, [target.id, auth!.user.id, body.grounds]);
    await audit(tx, auth!.user.id, "report.appeal_submitted", { type: "report", id: target.id }, { appeal_id: a!.id }, meta.ipHash);
  });
  await withDb(SYSTEM, (tx) => tx.q(`UPDATE reports SET status = 'appealed' WHERE id = $1 AND status IN ('published','disputed')`, [target.id]));
  return { ok: true };
});
