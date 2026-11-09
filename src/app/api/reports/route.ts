import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth/session";
import { checkCsrf, handleError, requireAuthLevel } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { publicId } from "@/lib/crypto";
import { audit } from "@/lib/server/audit";
import { ApiError, badRequest, conflict, forbidden, notFound } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";
import { ipHash } from "@/lib/server/request";
import { processEvidence, newStorageKey, putObject, deleteObject, MAX_EVIDENCE_FILES } from "@/lib/server/storage";
import { REPORT_LABELS } from "@/lib/categories";
import { env } from "@/lib/env";
import { featureEnabled } from "@/lib/launch-gates";

const Fields = z.object({
  playerProfileId: z.string().uuid(),
  category: z.enum(Object.keys(REPORT_LABELS) as [string, ...string[]]),
  description: z.string().trim().min(20).max(4000),
  incidentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accurateConfirm: z.literal("true"),
});

const MAX_BODY = 16 * 1024 * 1024;

/** Reads the request body with a hard byte cap (chunked uploads without Content-Length cannot bypass it). */
async function readLimitedForm(req: NextRequest, max: number): Promise<FormData> {
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "BAD_REQUEST", "Empty request.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel(); throw new ApiError(413, "TOO_LARGE", "Upload too large."); }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks);
  try {
    return await new Response(body, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
  } catch { throw new ApiError(400, "BAD_REQUEST", "Invalid form data."); }
}

/** Submit a negative report. Always private and 'submitted' until a moderator reviews it. */
export async function POST(req: NextRequest) {
  try {
    checkCsrf(req);
    if (!featureEnabled("report_submission")) throw new ApiError(503, "LAUNCH_GATE", "Report submission is not open yet.");
    const auth = await getAuth();
    await requireAuthLevel(auth, "mfa");
    const me = auth!;
    if (me.user.reportingRestricted) throw forbidden("Your reporting permissions are currently restricted.");
    if (Date.now() - me.user.createdAt.getTime() < env.reportMinAccountAgeHours * 3600_000)
      throw forbidden(`New accounts can submit reports after ${env.reportMinAccountAgeHours} hours.`);
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) throw new ApiError(413, "TOO_LARGE", "Upload too large.");
    await rateLimit(`report-day:${me.user.id}`, 5, 86400);
    await rateLimit(`report-hour:${me.user.id}`, 2, 3600);

    const form = await readLimitedForm(req, MAX_BODY);
    const parsed = Fields.safeParse({
      playerProfileId: form.get("playerProfileId"), category: form.get("category"), description: form.get("description"),
      incidentDate: form.get("incidentDate"), accurateConfirm: form.get("accurateConfirm"),
    });
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input.");
    const f = parsed.data;
    const incident = new Date(f.incidentDate + "T00:00:00Z");
    if (isNaN(+incident) || incident.getTime() > Date.now() + 86400_000 || incident.getTime() < Date.now() - 365 * 86400_000)
      throw badRequest("Incident date must be within the last 12 months.");

    const files = form.getAll("evidence").filter((x): x is File => typeof x === "object" && x !== null && "arrayBuffer" in x && (x as File).size > 0);
    if (files.length > MAX_EVIDENCE_FILES) throw badRequest(`Attach at most ${MAX_EVIDENCE_FILES} images.`);
    const processed: Awaited<ReturnType<typeof processEvidence>>[] = [];
    for (const file of files) processed.push(await processEvidence(file));

    const ih = await ipHash();
    const stored: string[] = [];
    try {
      const result = await withDb(me.db, async (tx) => {
        await tx.q(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`report:${me.user.id}:${f.playerProfileId}`]);
        const p = await tx.one<{ id: string; game_id: number; platform_id: number; owner_user_id: string | null }>(
          `SELECT id, game_id, platform_id, owner_user_id FROM player_profiles WHERE id = $1 AND deleted_at IS NULL`, [f.playerProfileId]);
        if (!p) throw notFound("Player not found.");
        if (p.owner_user_id === me.user.id) throw badRequest("You can't report your own profile.");
        const open = await tx.one(`SELECT 1 FROM reports WHERE reporter_user_id = $1 AND player_profile_id = $2 AND status IN ('submitted','under_review') AND deleted_at IS NULL`, [me.user.id, p.id]);
        if (open) throw conflict("You already have an open report about this player. You can add details if a moderator asks.");
        const recentSame = await tx.one(`SELECT 1 FROM reports WHERE reporter_user_id = $1 AND player_profile_id = $2 AND created_at > now() - interval '30 days'`, [me.user.id, p.id]);

        // Anti-brigading signals (visible to moderators only).
        const flags: string[] = [];
        if (recentSame) flags.push("repeat_reporter_30d");
        const burst = await withDb(SYSTEM, (s) => s.one<{ n: string; young: string }>(
          `SELECT count(*) AS n, count(*) FILTER (WHERE u.created_at > now() - interval '7 days') AS young
           FROM reports r LEFT JOIN users u ON u.id = r.reporter_user_id
           WHERE r.player_profile_id = $1 AND r.created_at > now() - interval '24 hours'`, [p.id]));
        if (Number(burst?.n ?? 0) >= 3) flags.push("report_burst_24h");
        if (Number(burst?.young ?? 0) >= 2) flags.push("young_accounts_cluster");
        if (Date.now() - me.user.createdAt.getTime() < 7 * 86400_000) flags.push("reporter_account_new");
        const rej = await withDb(SYSTEM, (s) => s.one<{ n: string }>(`SELECT count(*) AS n FROM reports WHERE reporter_user_id = $1 AND status IN ('rejected','removed')`, [me.user.id]));
        if (Number(rej?.n ?? 0) >= 3) flags.push("reporter_many_rejections");

        const ref = publicId("R", 8);
        const r = await tx.one<{ id: string }>(
          `INSERT INTO reports (public_ref, player_profile_id, game_id, platform_id, category, description, incident_date, reporter_user_id, flags)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [ref, p.id, p.game_id, p.platform_id, f.category, f.description, f.incidentDate, me.user.id, flags]);
        for (const ev of processed) {
          const key = newStorageKey(ev.mime.split("/")[1]);
          await putObject(key, ev.data, ev.mime);
          stored.push(key);
          await tx.q(
            `INSERT INTO report_evidence (report_id, uploaded_by, storage_key, stored_mime, size_bytes, sha256, scan_status) VALUES ($1, $2, $3, $4, $5, $6, 'clean')`,
            [r!.id, me.user.id, key, ev.mime, ev.size, ev.sha256]);
        }
        await audit(tx, me.user.id, "report.submitted", { type: "report", id: r!.id }, { category: f.category, evidence: processed.length, flags }, ih);
        return { id: r!.id, ref };
      });
      return NextResponse.json({ ok: true, reportId: result.id, ref: result.ref });
    } catch (e) {
      for (const k of stored) await deleteObject(k).catch(() => {});
      throw e;
    }
  } catch (e) {
    return handleError(e);
  }
}
