import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";

export const GET = route({ auth: "auth" }, async ({ auth }) => {
  const items = await withDb(auth!.db, (tx) => tx.q(`SELECT id, type, title, body, link, read_at, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [auth!.user.id]));
  return { notifications: items };
});

const Body = z.object({ ids: z.array(z.string().uuid()).max(100).optional(), all: z.boolean().optional() }).strict();

export const POST = route({ auth: "auth", body: Body }, async ({ auth, body }) => {
  await withDb(auth!.db, (tx) => body.all
    ? tx.q(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [auth!.user.id])
    : tx.q(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2::uuid[])`, [auth!.user.id, body.ids ?? []]));
  return { ok: true };
});
