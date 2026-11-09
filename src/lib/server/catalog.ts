import "server-only";
import { cache } from "react";
import { withDb, GUEST } from "@/lib/db";

export interface Game { id: number; slug: string; name: string }
export interface Platform { id: number; slug: string; name: string; integration_status: string; identifier_label: string }

export const getGames = cache(async (): Promise<Game[]> =>
  withDb(GUEST, (tx) => tx.q<Game>(`SELECT id, slug, name FROM games WHERE active ORDER BY sort_order, name`)));

export const getPlatforms = cache(async (): Promise<Platform[]> =>
  withDb(GUEST, (tx) => tx.q<Platform>(`SELECT id, slug, name, integration_status, identifier_label FROM platforms WHERE active ORDER BY sort_order, name`)));

export { COMMENDATION_LABELS as COMMENDATION_CATEGORIES, REPORT_LABELS as REPORT_CATEGORIES } from "@/lib/categories";
