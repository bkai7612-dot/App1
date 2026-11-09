import type { Metadata } from "next";
import { AuthShell } from "@/components/forms/AuthShell";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <AuthShell title="Choose a new password" subtitle="Resetting your password signs you out everywhere."><ResetForm token={token ?? ""} /></AuthShell>;
}
