import { route } from "@/lib/server/api";
import { searchPlayers } from "@/lib/server/players";

export const GET = route({ auth: "public", rate: { name: "search-api", limit: 60, windowSec: 60 } }, async ({ req }) => {
  const u = req.nextUrl.searchParams;
  const data = await searchPlayers({
    q: u.get("q") ?? undefined, game: u.get("game") ?? undefined, platform: u.get("platform") ?? undefined,
    verified: u.get("verified") === "1", positive: u.get("positive") === "1",
    sort: u.get("sort") === "recent" ? "recent" : "relevance", page: Number(u.get("page") ?? 1) || 1,
  });
  return { ...data, results: data.results.map((r) => ({ ...r, id: undefined })) };
});
