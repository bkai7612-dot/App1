import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { conflict, forbidden, notFound } from "@/lib/server/errors";

const Body = z.object({ reason: z.string().trim().min(10).max(2000) }).strict();

/** The verified owner reports an approved comment on their account as inaccurate. Free; reviewed by a moderator. */
export const POST = route({ auth: "mfa", body: Body, rate: { name: "comment-dispute", limit: 10, windowSec: 86400 } }, async ({ auth, params, body, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  const c = await withDb(SYSTEM, (tx) => tx.one<{ id: string; owner_user_id: string | null; status: string }>(
    `SELECT c.id, p.owner_user_id, c.status FROM player_comments c JOIN player_profiles p ON p.id = c.player_profile_id WHERE c.id = $1`, [id.data]));
  if (!c || c.status !== "approved") throw notFound();
  if (c.owner_user_id !== auth!.user.id) throw forbidden("Only the verified owner of this account can report its comments as inaccurate.");
  await withDb(auth!.db, async (tx) => {
    const open = await tx.one(`SELECT 1 FROM comment_disputes WHERE comment_id = $1 AND status = 'open'`, [c.id]);
    if (open) throw conflict("This comment is already being reviewed.");
    const dsp = await tx.one<{ id: string }>(`INSERT INTO comment_disputes (comment_id, owner_user_id, reason) VALUES ($1, $2, $3) RETURNING id`, [c.id, auth!.user.id, body.reason]);
    await audit(tx, auth!.user.id, "comment.disputed", { type: "comment_dispute", id: dsp!.id }, { comment: c.id }, meta.ipHash);
  });
  return { ok: true };
});
