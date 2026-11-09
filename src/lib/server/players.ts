import "server-only";
import { withDb, GUEST, SYSTEM, type DbContext, type Tx } from "@/lib/db";

export function normalizeName(name: string): string {
  return name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

export interface SearchParams {
  q?: string;
  game?: string;
  platform?: string;
  verified?: boolean;
  positive?: boolean;
  sort?: "relevance" | "recent";
  page?: number;
}

export interface PlayerSummary {
  id: string;
  public_id: string;
  display_name: string;
  game_name: string;
  game_slug: string;
  platform_name: string;
  platform_slug: string;
  platform_user_id: string | null;
  identity_status: string;
  claimed: boolean;
  positive_total: number;
  negative_published: number;
  last_active_at: Date;
  created_at: Date;
  is_demo: boolean;
}

export const PAGE_SIZE = 20;

const IDENTITY_SQL = `
  CASE
    WHEN EXISTS (SELECT 1 FROM gaming_accounts ga WHERE ga.player_profile_id = p.id AND ga.verification_status = 'verified') THEN 'verified'
    WHEN EXISTS (SELECT 1 FROM gaming_accounts ga WHERE ga.player_profile_id = p.id AND ga.verification_status = 'possible_match') THEN 'possible_match'
    ELSE 'unverified'
  END`;

export async function searchPlayers(sp: SearchParams): Promise<{ results: PlayerSummary[]; total: number; page: number; pages: number }> {
  const q = sp.q ? normalizeName(sp.q).slice(0, 64) : "";
  const page = Math.max(1, Math.min(500, Math.floor(sp.page ?? 1)));
  const where: string[] = ["p.deleted_at IS NULL"];
  const params: unknown[] = [];
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`);
    where.push(`p.display_name_normalized ILIKE $${params.length}`);
  }
  if (sp.game) { params.push(sp.game); where.push(`g.slug = $${params.length}`); }
  if (sp.platform) { params.push(sp.platform); where.push(`pl.slug = $${params.length}`); }
  if (sp.verified) where.push(`EXISTS (SELECT 1 FROM gaming_accounts ga WHERE ga.player_profile_id = p.id AND ga.verification_status = 'verified')`);
  if (sp.positive) where.push(`s.positive_total > 0`);
  let order = "p.last_active_at DESC";
  if (sp.sort !== "recent" && q) {
    params.push(q);
    order = `(p.display_name_normalized = $${params.length}) DESC, similarity(p.display_name_normalized, $${params.length}) DESC, p.last_active_at DESC`;
  }
  const whereSql = where.join(" AND ");
  return withDb(GUEST, async (tx) => {
    const countRow = await tx.one<{ n: string }>(
      `SELECT count(*) AS n FROM player_profiles p JOIN games g ON g.id = p.game_id JOIN platforms pl ON pl.id = p.platform_id
       JOIN player_reputation_stats s ON s.player_profile_id = p.id WHERE ${whereSql}`, params.slice(0, sp.sort !== "recent" && q ? params.length - 1 : params.length));
    const total = Number(countRow?.n ?? 0);
    const rows = await tx.q<PlayerSummary>(
      `SELECT p.id, p.public_id, p.display_name, g.name AS game_name, g.slug AS game_slug, pl.name AS platform_name, pl.slug AS platform_slug,
              p.platform_user_id, ${IDENTITY_SQL} AS identity_status, (p.owner_user_id IS NOT NULL) AS claimed,
              s.positive_total::int AS positive_total, s.negative_published::int AS negative_published,
              p.last_active_at, p.created_at, p.is_demo
       FROM player_profiles p JOIN games g ON g.id = p.game_id JOIN platforms pl ON pl.id = p.platform_id
       JOIN player_reputation_stats s ON s.player_profile_id = p.id
       WHERE ${whereSql} ORDER BY ${order} LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`, params);
    return { results: rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
  });
}

export interface PlayerProfile extends PlayerSummary {
  owner_user_id: string | null;
  game_id: number;
  platform_id: number;
  platform_integration: string;
  identifier_label: string;
}

export interface ReputationStats {
  positive_total: number;
  positive_pending: number;
  negative_published: number;
  reports_total: number;
  reports_pending: number;
  reports_disputed: number;
  reports_rejected_removed: number;
  reports_resolved: number;
}

export async function getProfileByPublicId(publicId: string, ctx: DbContext = GUEST): Promise<PlayerProfile | null> {
  if (!/^SS-[A-Z0-9]{4,12}$/.test(publicId)) return null;
  return withDb(ctx, (tx) => tx.one<PlayerProfile>(
    `SELECT p.id, p.public_id, p.display_name, g.name AS game_name, g.slug AS game_slug, pl.name AS platform_name, pl.slug AS platform_slug,
            p.platform_user_id, ${IDENTITY_SQL} AS identity_status, (p.owner_user_id IS NOT NULL) AS claimed, p.owner_user_id,
            p.game_id, p.platform_id, pl.integration_status AS platform_integration, pl.identifier_label,
            0 AS positive_total, 0 AS negative_published, p.last_active_at, p.created_at, p.is_demo
     FROM player_profiles p JOIN games g ON g.id = p.game_id JOIN platforms pl ON pl.id = p.platform_id
     WHERE p.public_id = $1 AND p.deleted_at IS NULL`, [publicId]));
}

export async function getStats(profileId: string): Promise<ReputationStats> {
  const row = await withDb(GUEST, (tx) => tx.one<Record<string, string>>(`SELECT * FROM player_reputation_stats WHERE player_profile_id = $1`, [profileId]));
  const n = (k: string) => Number(row?.[k] ?? 0);
  return {
    positive_total: n("positive_total"), positive_pending: n("positive_pending"), negative_published: n("negative_published"),
    reports_total: n("reports_total"), reports_pending: n("reports_pending"), reports_disputed: n("reports_disputed"),
    reports_rejected_removed: n("reports_rejected_removed"), reports_resolved: n("reports_resolved"),
  };
}

export interface LinkedAccount {
  id: string; platform_name: string; platform_slug: string; username: string; verification_status: string;
  verification_method: string | null; linked_at: Date; last_verified_at: Date | null; is_demo: boolean;
}

export async function getLinkedAccounts(profileId: string, ctx: DbContext = GUEST): Promise<LinkedAccount[]> {
  return withDb(ctx, (tx) => tx.q<LinkedAccount>(
    `SELECT ga.id, pl.name AS platform_name, pl.slug AS platform_slug, ga.username, ga.verification_status, ga.verification_method,
            ga.linked_at, ga.last_verified_at, ga.is_demo
     FROM gaming_accounts ga JOIN platforms pl ON pl.id = ga.platform_id
     WHERE ga.player_profile_id = $1 AND ga.verification_status <> 'unlinked' ORDER BY ga.linked_at`, [profileId]));
}

/** Is this user the verified owner of the profile? (Grants right of reply/appeal without Plus.) */
export async function isProfileOwner(tx: Tx, profileId: string, userId: string): Promise<boolean> {
  return !!(await tx.one(`SELECT 1 FROM player_profiles WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL`, [profileId, userId]));
}

export interface PublicCommendation { id: string; category: string; comment: string | null; created_at: Date; is_demo: boolean }
export interface PublicReport {
  id: string; public_ref: string; category: string; status: string; public_summary: string; outcome_type: string | null;
  outcome_note: string | null; published_at: Date | null; resolved_at: Date | null; created_at: Date; is_demo: boolean;
  response: string | null; response_at: Date | null;
}

/**
 * Detailed feedback. CALLERS MUST CHECK ENTITLEMENT FIRST (Plus, or profile owner for reports).
 * Reads only the column-safe public views: no reporter identity, raw descriptions or evidence.
 */
export async function getPublicCommendations(profileId: string, limit = 50): Promise<PublicCommendation[]> {
  return withDb(GUEST, (tx) => tx.q<PublicCommendation>(
    `SELECT id, category, comment, created_at, is_demo FROM public_commendations WHERE player_profile_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [profileId, limit]));
}

export async function getPublicReports(profileId: string, limit = 50): Promise<PublicReport[]> {
  return withDb(GUEST, (tx) => tx.q<PublicReport>(
    `SELECT r.id, r.public_ref, r.category, r.status, r.public_summary, r.outcome_type, r.outcome_note, r.published_at, r.resolved_at,
            r.created_at, r.is_demo, rr.body AS response, rr.created_at AS response_at
     FROM public_reports r LEFT JOIN public_report_responses rr ON rr.report_id = r.id
     WHERE r.player_profile_id = $1 ORDER BY coalesce(r.published_at, r.created_at) DESC LIMIT $2`, [profileId, limit]));
}

export async function getReputationHistory(profileId: string) {
  return withDb(GUEST, (tx) => tx.q<{ month: string; positive: number; negative: number }>(
    `WITH months AS (SELECT to_char(d, 'YYYY-MM') AS month FROM generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') d)
     SELECT m.month,
       (SELECT count(*)::int FROM public_commendations c WHERE c.player_profile_id = $1 AND to_char(c.created_at, 'YYYY-MM') = m.month) AS positive,
       (SELECT count(*)::int FROM public_reports r WHERE r.player_profile_id = $1 AND to_char(coalesce(r.published_at, r.created_at), 'YYYY-MM') = m.month) AS negative
     FROM months m ORDER BY m.month`, [profileId]));
}

export async function landingStats() {
  return withDb(GUEST, (tx) => tx.one<{ profiles: string; commendations: string; published: string; real_profiles: string; verified: string }>(
    `SELECT (SELECT count(*) FROM player_profiles WHERE deleted_at IS NULL) AS profiles,
            (SELECT count(*) FROM public_commendations) AS commendations,
            (SELECT count(*) FROM public_reports) AS published,
            (SELECT count(*) FROM player_profiles WHERE deleted_at IS NULL AND NOT is_demo) AS real_profiles,
            (SELECT count(*) FROM gaming_accounts WHERE verification_status = 'verified') AS verified`));
}

export async function profileIdByPublicId(publicId: string): Promise<string | null> {
  const p = await withDb(SYSTEM, (tx) => tx.one<{ id: string }>(`SELECT id FROM player_profiles WHERE public_id = $1 AND deleted_at IS NULL`, [publicId]));
  return p?.id ?? null;
}
