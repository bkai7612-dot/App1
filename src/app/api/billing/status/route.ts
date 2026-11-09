import { route } from "@/lib/server/api";
import { hasPlus, subscriptionSummary } from "@/lib/server/entitlements";

export const GET = route({ auth: "auth" }, async ({ auth }) => {
  return { plus: await hasPlus(auth!.user.id), subscription: await subscriptionSummary(auth!.user.id) };
});
