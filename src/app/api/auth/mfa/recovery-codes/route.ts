import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { replaceRecoveryCodes } from "@/lib/auth/mfa";
import { securityEvent, audit } from "@/lib/server/audit";
import { securityNotice } from "@/lib/auth/flows";

export const POST = route({ auth: "mfa", reauth: true, rate: { name: "recovery-regen", limit: 5, windowSec: 86400 } }, async ({ auth, meta }) => {
  const codes = await withDb(SYSTEM, async (tx) => {
    const c = await replaceRecoveryCodes(tx, auth!.user.id);
    await securityEvent(tx, auth!.user.id, "recovery_codes_regenerated", meta);
    await audit(tx, auth!.user.id, "security.recovery_codes_regenerated", { type: "user", id: auth!.user.id });
    await securityNotice(tx, auth!.user.id, auth!.user.email, "New recovery codes were generated; old codes no longer work");
    return c;
  });
  return { ok: true, recoveryCodes: codes };
});
