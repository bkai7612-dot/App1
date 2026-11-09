import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { clearSessionCookie, revokeSession } from "@/lib/auth/session";

export const POST = route({ auth: "public" }, async ({ auth }) => {
  if (auth) await withDb(SYSTEM, (tx) => revokeSession(tx, auth.session.id, "logout"));
  await clearSessionCookie();
  return { ok: true };
});
