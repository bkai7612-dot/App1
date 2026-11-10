import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { getObject } from "@/lib/server/storage";
import { notFound } from "@/lib/server/errors";

/** Staff-only view of a verification screenshot. Every access is audit-logged. */
export const GET = route({ permission: "mod.verifications.review" }, async ({ auth, params, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  const v = await withDb(auth!.db, (tx) => tx.one<{ evidence_key: string | null; evidence_mime: string | null }>(`SELECT evidence_key, evidence_mime FROM account_verifications WHERE id = $1`, [id.data]));
  if (!v?.evidence_key || !v.evidence_mime) throw notFound();
  await withDb(auth!.db, (tx) => audit(tx, auth!.user.id, "evidence.accessed", { type: "account_verification", id: id.data }, { as: "staff" }, meta.ipHash));
  const obj = await getObject(v.evidence_key);
  if (obj.signedUrl) return NextResponse.redirect(obj.signedUrl, { headers: { "Cache-Control": "no-store" } });
  return new NextResponse(new Uint8Array(obj.data!), { headers: { "Content-Type": v.evidence_mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox" } });
});
