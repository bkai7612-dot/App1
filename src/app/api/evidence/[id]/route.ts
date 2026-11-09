import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { audit, securityEvent } from "@/lib/server/audit";
import { can } from "@/lib/rbac";
import { getObject } from "@/lib/server/storage";
import { notFound } from "@/lib/server/errors";

/**
 * Private evidence download. Allowed: the uploader, or staff with mod.reports.review in an MFA-verified session.
 * Every access is audit-logged. Responses are never cacheable and are served as attachments.
 */
export const GET = route({ auth: "mfa", rate: { name: "evidence", limit: 120, windowSec: 3600 } }, async ({ auth, params, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  const staff = auth!.staffActive && can(auth!.user.role, "mod.reports.review");
  // Query under the caller's RLS context: non-staff only ever see their own uploads.
  const ev = await withDb(auth!.db, (tx) => tx.one<{ id: string; storage_key: string; stored_mime: string; uploaded_by: string; report_id: string }>(
    `SELECT id, storage_key, stored_mime, uploaded_by, report_id FROM report_evidence WHERE id = $1 AND deleted_at IS NULL AND scan_status = 'clean'`, [id.data]));
  if (!ev || (!staff && ev.uploaded_by !== auth!.user.id)) {
    await withDb(auth!.db, (tx) => securityEvent(tx, auth!.user.id, "evidence_access_denied", meta, { evidence_id: id.data }));
    throw notFound();
  }
  await withDb(auth!.db, (tx) => audit(tx, auth!.user.id, "evidence.accessed", { type: "report_evidence", id: ev.id }, { report_id: ev.report_id, as: staff ? "staff" : "uploader" }, meta.ipHash));
  const obj = await getObject(ev.storage_key);
  if (obj.signedUrl) return NextResponse.redirect(obj.signedUrl, { headers: { "Cache-Control": "no-store" } });
  return new NextResponse(new Uint8Array(obj.data!), {
    headers: {
      "Content-Type": ev.stored_mime,
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="evidence-${ev.id}.${ev.stored_mime.split("/")[1]}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
    },
  });
});
