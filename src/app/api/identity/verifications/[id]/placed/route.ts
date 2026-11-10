import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth/session";
import { checkCsrf, handleError, requireAuthLevel } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { ApiError, badRequest, notFound } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";
import { ipHash } from "@/lib/server/request";
import { processEvidence, newStorageKey, putObject, deleteObject } from "@/lib/server/storage";

const MAX = 6 * 1024 * 1024;

/**
 * Profile-code check: "I've placed the code". Optional public profile link and an optional private screenshot
 * (for platforms without a public bio, e.g. Ubisoft). Moves the request to the top of the moderator queue.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    checkCsrf(req);
    const auth = await getAuth();
    await requireAuthLevel(auth, "mfa");
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) throw notFound();
    await rateLimit(`code-placed:${auth!.user.id}`, 10, 3600);
    if (Number(req.headers.get("content-length") ?? 0) > MAX) throw new ApiError(413, "TOO_LARGE", "Upload too large.");
    const form = await req.formData();
    const url = String(form.get("profileUrl") ?? "").trim();
    if (url && !/^https:\/\/[^\s]{4,300}$/.test(url)) throw badRequest("Profile link must start with https://");
    const file = form.get("screenshot");
    let key: string | null = null, mime: string | null = null;
    if (file && typeof file === "object" && "arrayBuffer" in file && (file as File).size > 0) {
      const ev = await processEvidence(file as File);
      key = newStorageKey(ev.mime.split("/")[1]); mime = ev.mime;
      await putObject(key, ev.data, ev.mime);
    }
    const updated = await withDb(SYSTEM, (tx) => tx.one<{ id: string; old_key: string | null }>(
      `UPDATE account_verifications v SET code_placed_at = now(), profile_url = coalesce($3, v.profile_url),
              evidence_key = coalesce($4, v.evidence_key), evidence_mime = coalesce($5, v.evidence_mime)
       FROM (SELECT evidence_key AS old_key FROM account_verifications WHERE id = $1) o
       WHERE v.id = $1 AND v.user_id = $2 AND v.status = 'pending' AND v.method = 'profile_code' RETURNING v.id, o.old_key`,
      [id, auth!.user.id, url || null, key, mime]));
    if (!updated) { if (key) await deleteObject(key).catch(() => {}); throw notFound(); }
    if (key && updated.old_key && updated.old_key !== key) await deleteObject(updated.old_key).catch(() => {});
    await withDb(auth!.db, async (tx) => audit(tx, auth!.user.id, "identity.code_placed", { type: "account_verification", id }, { url: !!url, screenshot: !!key }, await ipHash()));
    return NextResponse.json({ ok: true });
  } catch (e) { return handleError(e); }
}
