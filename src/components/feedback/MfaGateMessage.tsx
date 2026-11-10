"use client";
import Link from "next/link";
import { ClientApiError } from "@/lib/client";

/** Turns gate errors (email/MFA/reauth) into actionable guidance. */
export function GateError({ error }: { error: unknown }) {
  if (!error) return null;
  if (error instanceof ClientApiError) {
    if (error.code === "MFA_ENROLMENT_REQUIRED") return <p role="alert" className="text-sm text-amber-300">Two-factor authentication is required for this. <Link href="/account/security" className="underline">Set it up now</Link>.</p>;
    if (error.code === "EMAIL_UNVERIFIED") return <p role="alert" className="text-sm text-amber-300">Please verify your email first. <Link href="/account" className="underline">Resend verification</Link>.</p>;
    if (error.code === "UNAUTHENTICATED") return <p role="alert" className="text-sm text-amber-300">Please <Link href="/login" className="underline">sign in</Link>.</p>;
    return <p role="alert" className="text-sm text-neg">{error.message}</p>;
  }
  if (error instanceof Error && error.message) return <p role="alert" className="text-sm text-neg">{error.message}</p>;
  return <p role="alert" className="text-sm text-neg">Something went wrong.</p>;
}
