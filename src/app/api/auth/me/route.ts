import { route } from "@/lib/server/api";
import { hasPlus } from "@/lib/server/entitlements";

export const GET = route({ auth: "public" }, async ({ auth }) => {
  if (!auth) return { user: null };
  return {
    user: {
      id: auth.user.id, displayName: auth.user.displayName, role: auth.user.role,
      mfaEnabled: auth.user.mfaEnabled, emailVerified: auth.user.emailVerified,
      pendingMfa: auth.pendingMfa, plus: auth.pendingMfa ? false : await hasPlus(auth.user.id),
    },
  };
});
