import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { passkeyAuthOptions } from "@/lib/auth/mfa";
import { badRequest } from "@/lib/server/errors";

/** Options for a passkey assertion — used for sign-in second factor AND for re-authentication. */
export const POST = route({ auth: "pendingMfa", rate: { name: "pk-auth", limit: 30, windowSec: 900 } }, async ({ auth }) => {
  const opts = await withDb(SYSTEM, (tx) => passkeyAuthOptions(tx, auth!.session.id, auth!.user.id));
  if (!opts) throw badRequest("No passkeys are registered for this account.");
  return opts;
});
