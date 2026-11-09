import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { audit, securityEvent } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { revokeAllSessions } from "@/lib/auth/session";
import { assignableRoles, can, ROLES, type Role } from "@/lib/rbac";
import { ApiError, badRequest, forbidden, notFound } from "@/lib/server/errors";
import { hasFreshReauth } from "@/lib/auth/session";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suspend"), days: z.number().int().min(1).max(3650).nullable(), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("unsuspend"), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("restrict_reporting"), days: z.number().int().min(1).max(3650), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("unrestrict_reporting"), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("set_role"), role: z.enum(ROLES), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("revoke_sessions"), reason: z.string().trim().min(5).max(500) }),
]);

const PERM = { suspend: "users.suspend", unsuspend: "users.suspend", restrict_reporting: "users.restrict_reporting", unrestrict_reporting: "users.restrict_reporting", set_role: "users.roles.manage", revoke_sessions: "users.suspend" } as const;

export const POST = route({ permission: "users.view", body: Body }, async ({ auth, params, body, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  if (!can(auth!.user.role, PERM[body.action])) throw forbidden();
  if (id.data === auth!.user.id) throw forbidden("You cannot perform administrative actions on your own account.");
  if (body.action === "set_role" && !hasFreshReauth(auth!)) throw new ApiError(403, "REAUTH_REQUIRED", "Please confirm it's you to continue.");

  await withDb(auth!.db, async (tx) => {
    const target = await tx.one<{ id: string; role: Role }>(`SELECT id, role FROM users WHERE id = $1`, [id.data]);
    if (!target) throw notFound();
    if (target.role !== "user" && body.action !== "set_role") {
      const actor = auth!.user.role;
      const allowed = actor === "super_admin" || (actor === "admin" && (target.role === "moderator" || target.role === "senior_moderator"));
      if (!allowed) throw forbidden("You cannot restrict an account with this role.");
    }
    switch (body.action) {
      case "suspend":
        await tx.q(`UPDATE users SET suspended_at = now(), suspended_until = CASE WHEN $2::int IS NULL THEN NULL ELSE now() + ($2 || ' days')::interval END, suspension_reason = $3 WHERE id = $1`, [target.id, body.days, body.reason]);
        break;
      case "unsuspend":
        await tx.q(`UPDATE users SET suspended_at = NULL, suspended_until = NULL, suspension_reason = NULL WHERE id = $1`, [target.id]); break;
      case "restrict_reporting":
        await tx.q(`UPDATE users SET reporting_restricted_until = now() + ($2 || ' days')::interval WHERE id = $1`, [target.id, body.days]); break;
      case "unrestrict_reporting":
        await tx.q(`UPDATE users SET reporting_restricted_until = NULL WHERE id = $1`, [target.id]); break;
      case "set_role":
        if (!assignableRoles(auth!.user.role).includes(body.role) || !assignableRoles(auth!.user.role).includes(target.role)) throw forbidden("You cannot assign that role.");
        if (target.role === body.role) throw badRequest("No change.");
        await tx.q(`UPDATE users SET role = $2 WHERE id = $1`, [target.id, body.role]); // also enforced by DB trigger
        break;
      case "revoke_sessions":
        break;
    }
    await audit(tx, auth!.user.id, `admin.user.${body.action}`, { type: "user", id: target.id }, { reason: body.reason, ...(body.action === "set_role" ? { from: target.role, to: body.role } : {}) }, meta.ipHash);
  });
  await withDb(SYSTEM, async (tx) => {
    if (["suspend", "set_role", "revoke_sessions"].includes(body.action)) await revokeAllSessions(tx, id.data, `admin_${body.action}`);
    await securityEvent(tx, id.data, `admin_${body.action}`, meta, { by: auth!.user.id });
    if (body.action === "set_role") await notify(tx, id.data, "security", "Your account role was changed", undefined, "/account/security");
  });
  return { ok: true };
});
