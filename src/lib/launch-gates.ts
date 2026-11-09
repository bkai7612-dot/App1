import "server-only";
import { env } from "@/lib/env";

/**
 * Mandatory production launch gates. In SS_LAUNCH_MODE=production, features stay DISABLED
 * until every gate they depend on is listed in SS_LAUNCH_GATES_APPROVED (written approval recorded
 * in docs/COMPLIANCE.md). Development/staging are unaffected.
 */
export const LAUNCH_GATES = [
  { id: "auth_mfa_tested", label: "Authentication and MFA testing" },
  { id: "access_control_tested", label: "Account ownership and access-control testing" },
  { id: "rls_tested", label: "Database Row Level Security testing" },
  { id: "secrets_reviewed", label: "Secrets and configuration review" },
  { id: "evidence_storage_reviewed", label: "Evidence-storage security review" },
  { id: "payments_reviewed", label: "Payment security review" },
  { id: "privacy_terms_reviewed", label: "Privacy policy and terms review" },
  { id: "dpia_completed", label: "Data protection assessment (DPIA)" },
  { id: "osa_assessed", label: "Online Safety Act scope assessment" },
  { id: "moderation_procedures", label: "Moderation and complaints procedures" },
  { id: "backup_restore_tested", label: "Backup and recovery test" },
  { id: "incident_plan", label: "Incident response plan" },
  { id: "pentest_completed", label: "Independent security testing" },
  { id: "legal_review_reporting", label: "Legal review of the reputation and reporting model" },
  { id: "production_approved", label: "Written approval of production readiness" },
] as const;
export type GateId = (typeof LAUNCH_GATES)[number]["id"];

const ALL = LAUNCH_GATES.map((g) => g.id);
const FEATURE_GATES: Record<string, GateId[]> = {
  registration: ["auth_mfa_tested", "access_control_tested", "rls_tested", "secrets_reviewed", "privacy_terms_reviewed", "dpia_completed", "incident_plan", "pentest_completed", "production_approved"],
  payments: ["payments_reviewed", "privacy_terms_reviewed", "secrets_reviewed", "production_approved"],
  report_submission: ["evidence_storage_reviewed", "moderation_procedures", "osa_assessed", "legal_review_reporting", "production_approved"],
  report_publication: ALL as GateId[],
};

export function gateStatus() {
  const approved = new Set(env.launchGatesApproved);
  return LAUNCH_GATES.map((g) => ({ ...g, approved: approved.has(g.id) }));
}

export function featureEnabled(feature: keyof typeof FEATURE_GATES): boolean {
  if (env.launchMode !== "production") return true;
  const approved = new Set(env.launchGatesApproved);
  return FEATURE_GATES[feature].every((g) => approved.has(g));
}

export function isPrelaunch(): boolean {
  return env.launchMode === "production" && !LAUNCH_GATES.every((g) => env.launchGatesApproved.includes(g.id));
}
