import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { notFound } from "@/lib/server/errors";

/** Cancel your own pending verification (abandoned QR, sign-in or code check) so you can try another method. */
export const POST = route({ auth: "auth", rate: { name: "verify-cancel", limit: 30, windowSec: 3600 } }, async ({ auth, params, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  const r = await withDb(SYSTEM, (tx) => tx.one<{ id: string }>(
    `UPDATE account_verifications SET status = 'cancelled', decided_at = now(), nonce_hash = NULL, handoff_token_hash = NULL
     WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING id`, [id.data, auth!.user.id]));
  if (!r) throw notFound();
  await withDb(auth!.db, (tx) => audit(tx, auth!.user.id, "identity.verification_cancelled", { type: "account_verification", id: r.id }, {}, meta.ipHash));
  return { ok: true };
});
