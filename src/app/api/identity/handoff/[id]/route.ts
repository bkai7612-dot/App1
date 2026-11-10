import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { notFound } from "@/lib/server/errors";

/** Desktop polls this while the player approves on their phone. Own verifications only (RLS + explicit check). */
export const GET = route({ auth: "auth", rate: { name: "handoff-poll", limit: 400, windowSec: 600 } }, async ({ auth, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  const v = await withDb(auth!.db, (tx) => tx.one<{ status: string; method: string; expires_at: Date; scanned: boolean }>(
    `SELECT status, method, expires_at, (handoff_token_hash IS NULL) AS scanned FROM account_verifications WHERE id = $1 AND user_id = $2`, [id.data, auth!.user.id]));
  if (!v) throw notFound();
  const state = v.status === "approved" ? "verified" : v.status === "pending" && v.method === "manual_review" ? "review"
    : v.status === "pending" ? (v.expires_at.getTime() < Date.now() ? "expired" : v.scanned ? "scanned" : "waiting") : v.status;
  return { state };
});
