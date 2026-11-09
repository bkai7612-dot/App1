"use client";
import Link from "next/link";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client";

/** Verification requires a click (POST), so link scanners that prefetch URLs don't consume the token. */
export function VerifyEmail({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");
  const go = async () => {
    setState("busy");
    try { await api("/api/auth/verify-email", { body: { token } }); setState("ok"); }
    catch (e) { setState("err"); setMsg(e instanceof ClientApiError ? e.message : "Verification failed."); }
  };
  if (!token) return <p className="text-sm text-text-muted">This link is missing its token.</p>;
  if (state === "ok") return <div className="space-y-4"><p>Your email is verified.</p><Link href="/account/security" className="btn-primary w-full">Continue to security setup</Link></div>;
  return (
    <div className="space-y-4">
      <button onClick={go} disabled={state === "busy"} className="btn-primary w-full py-3">{state === "busy" && <span className="spinner" />}Confirm my email address</button>
      {state === "err" && <p role="alert" className="text-sm text-neg">{msg}</p>}
    </div>
  );
}
