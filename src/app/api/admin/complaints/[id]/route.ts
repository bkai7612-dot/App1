import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { audit, moderationAction } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { badRequest, notFound } from "@/lib/server/errors";
import { sendEmail } from "@/lib/server/email";

const Body = z.object({
  decision: z.enum(["in_progress", "upheld", "not_upheld", "closed"]),
  note: z.string().trim().max(4000).optional(),
  internalNote: z.string().trim().max(2000).optional(),
}).strict();

/** Senior moderators handle complaints. The response note is sent to the complainant. */
export const POST = route({ permission: "mod.content.remove", body: Body }, async ({ auth, params, body, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  if (body.decision !== "in_progress" && (!body.note || body.note.length < 10)) throw badRequest("Write the response the complainant will receive (at least 10 characters).");
  return withDb(auth!.db, async (tx) => {
    const c = await tx.one<{ id: string; public_ref: string; status: string; user_id: string | null; contact_email: string | null }>(
      `SELECT id, public_ref, status, user_id, contact_email FROM complaints WHERE id = $1 FOR UPDATE`, [id.data]);
    if (!c) throw notFound();
    if (!["open", "in_progress"].includes(c.status)) throw badRequest("This complaint is already decided.");
    const final = body.decision !== "in_progress";
    await tx.q(`UPDATE complaints SET status = $2, handled_by = $3, response_note = coalesce($4, response_note), closed_at = CASE WHEN $5 THEN now() ELSE NULL END WHERE id = $1`,
      [c.id, body.decision, auth!.user.id, body.note ?? null, final]);
    await moderationAction(tx, auth!.user.id, { type: "complaint", id: c.id }, `complaint_${body.decision}`, c.status, body.decision,
      [body.note ? `Told complainant: ${body.note}` : null, body.internalNote ? `Internal: ${body.internalNote}` : null].filter(Boolean).join(" | ") || null);
    await audit(tx, auth!.user.id, `complaint.${body.decision}`, { type: "complaint", id: c.id }, {}, meta.ipHash);
    if (final) {
      const title = `Decision on your complaint ${c.public_ref}`;
      if (c.user_id) await notify(tx, c.user_id, "report_update", title, body.note!.slice(0, 480), "/complaints");
      else if (c.contact_email) await sendEmail({ to: c.contact_email, subject: `ServerSentry: ${title}`, text: `${body.note}\n\nIf you're unhappy with how we handled personal data, you can complain to the Information Commissioner's Office (ico.org.uk).` });
    }
    return { ok: true };
  });
});
