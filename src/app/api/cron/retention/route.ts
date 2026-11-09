import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { runRetention } from "@/lib/server/retention";

export async function GET(req: NextRequest) {
  const secret = env.cronSecret;
  const got = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(got, `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await runRetention()) });
  } catch (e) {
    console.error("[retention] failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
