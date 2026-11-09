import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "@/lib/env";

declare global {
  // eslint-disable-next-line no-var
  var __ssPool: Pool | undefined;
}

function pool(): Pool {
  if (!globalThis.__ssPool) {
    const url = env.databaseUrl;
    const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
    globalThis.__ssPool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      // TLS is required for any non-local database (Supabase supports TLS).
      ssl: isLocal || process.env.DATABASE_SSL === "disable" ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" },
      statement_timeout: 15_000,
      idle_in_transaction_session_timeout: 20_000,
    });
  }
  return globalThis.__ssPool;
}

/**
 * Database context used by Row Level Security policies.
 * - userId: authenticated user (or null for guests)
 * - role: application role (user/moderator/...) or "system" for trusted server jobs
 */
export interface DbContext {
  userId: string | null;
  role: string;
}

export const GUEST: DbContext = { userId: null, role: "guest" };
export const SYSTEM: DbContext = { userId: null, role: "system" };

export type Tx = {
  q<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T | null>;
  client: PoolClient;
};

/**
 * Runs fn inside a transaction with RLS context variables set (transaction-local).
 * All application queries go through this function.
 */
export async function withDb<T>(ctx: DbContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('search_path', 'ss, public', true), set_config('app.user_id', $1, true), set_config('app.role', $2, true)", [
      ctx.userId ?? "",
      ctx.role,
    ]);
    const tx: Tx = {
      client,
      async q(sql, params) {
        const r = await client.query(sql, params as unknown[]);
        return r.rows;
      },
      async one(sql, params) {
        const r = await client.query(sql, params as unknown[]);
        return (r.rows[0] as never) ?? null;
      },
    };
    const result = await fn(tx);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}
