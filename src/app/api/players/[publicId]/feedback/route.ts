import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { hasPlus } from "@/lib/server/entitlements";
import { getProfileByPublicId, getPublicCommendations, getPublicReports, getReputationHistory, getStats, isProfileOwner } from "@/lib/server/players";
import { ApiError, notFound } from "@/lib/server/errors";

/**
 * Detailed feedback API. Counts are public; comments, summaries and history require
 * ServerSentry Plus (verified server-side). The verified profile owner may read reports about themselves.
 */
export const GET = route({ auth: "public", rate: { name: "feedback-api", limit: 120, windowSec: 60 } }, async ({ auth, params, req }) => {
  const profile = await getProfileByPublicId(params.publicId);
  if (!profile) throw notFound();
  const type = req.nextUrl.searchParams.get("type") ?? "stats";
  const stats = await getStats(profile.id);
  if (type === "stats") return { stats };
  const viewer = auth && !auth.pendingMfa ? auth : null;
  const plus = viewer ? await hasPlus(viewer.user.id) : false;
  const owner = viewer ? await withDb(viewer.db, (tx) => isProfileOwner(tx, profile.id, viewer.user.id)) : false;
  const allowed = plus || (type === "reports" && owner);
  if (!allowed) throw new ApiError(402, "PLUS_REQUIRED", "ServerSentry Plus is required to read detailed feedback.");
  if (type === "commendations") return { stats, commendations: await getPublicCommendations(profile.id) };
  if (type === "reports") return { stats, reports: await getPublicReports(profile.id) };
  if (type === "history") return { stats, history: await getReputationHistory(profile.id) };
  throw notFound();
});
