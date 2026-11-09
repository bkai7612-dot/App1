import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { passkeyRegistrationOptions } from "@/lib/auth/mfa";
import { hasFreshReauth } from "@/lib/auth/session";
import { ApiError } from "@/lib/server/errors";

export const POST = route({ auth: "auth", rate: { name: "pk-reg", limit: 20, windowSec: 3600 } }, async ({ auth }) => {
  if (auth!.user.mfaEnabled && !hasFreshReauth(auth!)) throw new ApiError(403, "REAUTH_REQUIRED", "Please confirm it's you to continue.");
  return withDb(SYSTEM, (tx) => passkeyRegistrationOptions(tx, auth!.session.id, auth!.user));
});
