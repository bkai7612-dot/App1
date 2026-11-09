import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { audit, securityEvent } from "@/lib/server/audit";
import { securityNotice } from "@/lib/auth/flows";
import { notFound } from "@/lib/server/errors";

/** Unlink (soft) a gaming account from a profile you own. Requires fresh re-authentication. Fully audited. */
export const POST = route({ auth: "mfa", reauth: true }, async ({ auth, params, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  await withDb(auth!.db, async (tx) => {
    const row = await tx.one<{ id: string; verification_status: string }>(
      `UPDATE gaming_accounts ga SET verification_status = 'unlinked', unlinked_at = now()
       FROM player_profiles p WHERE ga.id = $1 AND p.id = ga.player_profile_id AND p.owner_user_id = $2 AND ga.verification_status <> 'unlinked'
       RETURNING ga.id, ga.verification_status`, [id.data, auth!.user.id]);
    if (!row) throw notFound();
    await securityEvent(tx, auth!.user.id, "gaming_account_unlinked", meta);
    await audit(tx, auth!.user.id, "identity.account_unlinked", { type: "gaming_account", id: row.id }, {}, meta.ipHash);
  });
  await withDb(SYSTEM, (tx) => securityNotice(tx, auth!.user.id, auth!.user.email, "A gaming account was unlinked from your profile"));
  return { ok: true };
});
