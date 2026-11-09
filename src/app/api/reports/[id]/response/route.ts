import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { conflict, forbidden, notFound } from "@/lib/server/errors";

const Body = z.object({ body: z.string().trim().min(10).max(2000) });

/** Right of reply for the verified profile owner (free; no Plus required). */
export const POST = route({ auth: "mfa", body: Body, rate: { name: "report-response", limit: 10, windowSec: 86400 } }, async ({ auth, body, params, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  const target = await withDb(SYSTEM, (tx) => tx.one<{ id: string; status: string; owner_user_id: string | null }>(
    `SELECT r.id, r.status, p.owner_user_id FROM public_reports r JOIN player_profiles p ON p.id = r.player_profile_id WHERE r.id = $1`, [id.data]));
  if (!target) throw notFound();
  if (target.owner_user_id !== auth!.user.id) throw forbidden("Only the verified owner of this profile can respond.");
  await withDb(auth!.db, async (tx) => {
    const active = await tx.one(`SELECT 1 FROM report_responses WHERE report_id = $1 AND status IN ('pending','published')`, [target.id]);
    if (active) throw conflict("You already have a response on this report.");
    const r = await tx.one<{ id: string }>(`INSERT INTO report_responses (report_id, author_user_id, body) VALUES ($1, $2, $3) RETURNING id`, [target.id, auth!.user.id, body.body]);
    await audit(tx, auth!.user.id, "report.response_submitted", { type: "report", id: target.id }, { response_id: r!.id }, meta.ipHash);
  });
  // A response marks a published report as disputed.
  await withDb(SYSTEM, (tx) => tx.q(`UPDATE reports SET status = 'disputed' WHERE id = $1 AND status = 'published'`, [target.id]));
  return { ok: true };
});
