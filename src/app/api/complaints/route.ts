import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { badRequest } from "@/lib/server/errors";
import { COMPLAINT_CATEGORIES } from "@/lib/complaints";


const Body = z.object({
  category: z.enum(COMPLAINT_CATEGORIES),
  targetRef: z.string().trim().max(300).optional(),
  body: z.string().trim().min(20).max(5000),
  contactEmail: z.string().trim().email().max(254).optional(),
}).strict();

/** L-01: web complaint form. Open to signed-out people (e.g. someone who can't claim a profile), rate-limited. */
export const POST = route({ auth: "public", body: Body, rate: { name: "complaint", limit: 5, windowSec: 86400 } }, async ({ auth, body, meta }) => {
  const userId = auth && !auth.pendingMfa ? auth.user.id : null;
  if (!userId && !body.contactEmail) throw badRequest("Please give an email address so we can reply.");
  return withDb(SYSTEM, async (tx) => {
    const row = await tx.one<{ id: string; public_ref: string; acknowledge_by: Date; due_at: Date }>(
      `INSERT INTO complaints (user_id, contact_email, category, target_ref, body, ip_hash) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, public_ref, acknowledge_by, due_at`,
      [userId, body.contactEmail ?? null, body.category, body.targetRef || null, body.body, meta.ipHash]);
    await audit(tx, userId, "complaint.submitted", { type: "complaint", id: row!.id }, { category: body.category }, meta.ipHash);
    // Urgent categories alert staff straight away.
    if (body.category === "illegal_content") {
      const staff = await tx.q<{ id: string }>(`SELECT id FROM users WHERE role IN ('senior_moderator','admin','super_admin') AND deleted_at IS NULL AND suspended_at IS NULL LIMIT 20`);
      for (const s of staff) await notify(tx, s.id, "report_update", `Urgent complaint ${row!.public_ref}: illegal content`, undefined, "/admin/complaints");
    }
    if (userId) await notify(tx, userId, "report_update", `We received your complaint ${row!.public_ref}`, "We'll acknowledge it within 2 working days and aim to decide within 14 days.", "/complaints");
    return { ok: true, ref: row!.public_ref, dueAt: row!.due_at };
  });
});
