import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/auth/flows";

export const POST = route({ auth: "auth", rate: { name: "resend-verify", limit: 3, windowSec: 3600 } }, async ({ auth }) => {
  if (auth!.user.emailVerified) return { ok: true };
  await withDb(SYSTEM, (tx) => sendVerificationEmail(tx, auth!.user.id, auth!.user.email));
  return { ok: true };
});
