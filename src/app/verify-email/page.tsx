import type { Metadata } from "next";
import { AuthShell } from "@/components/forms/AuthShell";
import { VerifyEmail } from "./VerifyEmail";

export const metadata: Metadata = { title: "Verify email", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <AuthShell title="Verify your email"><VerifyEmail token={token ?? ""} /></AuthShell>;
}
