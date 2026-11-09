/**
 * Role-based access control. "premium" is NOT a role: it is an entitlement derived
 * from verified Stripe subscription state, so it can never be self-assigned.
 */
export const ROLES = ["user", "moderator", "senior_moderator", "admin", "super_admin"] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  | "mod.dashboard"
  | "mod.reports.review"        // view queue, inspect evidence, request info, publish/reject
  | "mod.commendations.review"
  | "mod.verifications.review"
  | "mod.responses.review"
  | "mod.appeals.decide"        // senior+
  | "mod.content.remove"        // senior+: remove published content
  | "users.view"                // staff: search users, view moderation history
  | "users.restrict_reporting"  // senior+
  | "users.suspend"             // senior+ (staff accounts: admin only, enforced in DB)
  | "users.roles.manage"        // admin: user<->moderator<->senior; super_admin: all
  | "audit.view"                // admin+
  | "billing.view"              // admin+: subscription status only, never payment secrets
  | "privacy.requests.manage"   // admin+
  | "recovery.manage"           // admin+: account recovery requests
  | "system.launch_gates.view"; // admin+

const MATRIX: Record<Role, Permission[]> = {
  user: [],
  moderator: ["mod.dashboard", "mod.reports.review", "mod.commendations.review", "mod.verifications.review", "mod.responses.review", "users.view"],
  senior_moderator: [],
  admin: [],
  super_admin: [],
};
MATRIX.senior_moderator = [...MATRIX.moderator, "mod.appeals.decide", "mod.content.remove", "users.restrict_reporting", "users.suspend"];
MATRIX.admin = [...MATRIX.senior_moderator, "users.roles.manage", "audit.view", "billing.view", "privacy.requests.manage", "recovery.manage", "system.launch_gates.view"];
MATRIX.super_admin = [...MATRIX.admin];

export function can(role: Role | string | null | undefined, p: Permission): boolean {
  if (!role || !(ROLES as readonly string[]).includes(role)) return false;
  return MATRIX[role as Role].includes(p);
}

export function isStaff(role: string | null | undefined): boolean {
  return role === "moderator" || role === "senior_moderator" || role === "admin" || role === "super_admin";
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

export const ROLE_LABELS: Record<Role, string> = {
  user: "Member",
  moderator: "Moderator",
  senior_moderator: "Senior moderator",
  admin: "Administrator",
  super_admin: "Super administrator",
};

/** Which roles may the actor assign? Mirrors the database trigger ss.users_protect(). */
export function assignableRoles(actor: Role): Role[] {
  if (actor === "super_admin") return [...ROLES];
  if (actor === "admin") return ["user", "moderator", "senior_moderator"];
  return [];
}
