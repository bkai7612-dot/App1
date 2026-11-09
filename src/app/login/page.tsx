import type { Metadata } from "next";
import { AuthShell } from "@/components/forms/AuthShell";
import { LoginForm } from "./LoginForm";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Log in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Welcome back" subtitle="Log in to ServerSentry.">
      <LoginForm next={safeNext(sp.next, "/me/profile")} />
    </AuthShell>
  );
}
