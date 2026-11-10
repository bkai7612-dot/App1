import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { hasPlus } from "@/lib/server/entitlements";
import { getProfileByPublicId, getPublicCommendations, getPublicReports, getReputationHistory, getStats, isProfileOwner, getPublicComments, type ReputationStats } from "@/lib/server/players";
import { ApiError, notFound } from "@/lib/server/errors";

/** D2: unreviewed submission counts are only for the profile owner and moderators. */
function publicStats(s: ReputationStats, full: boolean) {
  if (full) return s;
  const { reports_total: _t, reports_pending: _p, positive_pending: _pp, ...rest } = s;
  void _t; void _p; void _pp;
  return rest;
}

/**
 * Detailed feedback API.
 * - Everyone: counts of published/disputed/rejected, and report STATUS (category, dates, status, outcome, the player's response). (D1)
 * - ServerSentry Plus: the moderator's written summaries, comments, commendation comments and history.
 * - Profile owner and active moderators: everything about that profile, free.
 */
export const GET = route({ auth: "public", rate: { name: "feedback-api", limit: 120, windowSec: 60 } }, async ({ auth, params, req }) => {
  const profile = await getProfileByPublicId(params.publicId);
  if (!profile) throw notFound();
  const type = req.nextUrl.searchParams.get("type") ?? "stats";
  const viewer = auth && !auth.pendingMfa ? auth : null;
  const owner = viewer ? await withDb(viewer.db, (tx) => isProfileOwner(tx, profile.id, viewer.user.id)) : false;
  const staff = !!viewer?.staffActive;
  const plus = viewer ? await hasPlus(viewer.user.id) : false;
  const full = plus || owner || staff;
  const stats = publicStats(await getStats(profile.id), owner || staff);
  if (type === "stats") return { stats };
  if (type === "reports") {
    const reports = await getPublicReports(profile.id);
    return { stats, summariesIncluded: full, reports: full ? reports : reports.map((r) => ({ ...r, public_summary: null })) };
  }
  if (!full) throw new ApiError(402, "PLUS_REQUIRED", "ServerSentry Plus is required to read detailed feedback.");
  if (type === "commendations") return { stats, commendations: await getPublicCommendations(profile.id) };
  if (type === "comments") return { stats, comments: await getPublicComments(profile.id) };
  if (type === "history") return { stats, history: await getReputationHistory(profile.id) };
  throw notFound();
});
