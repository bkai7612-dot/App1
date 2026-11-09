import type { Metadata } from "next";
import { AuthShell } from "@/components/forms/AuthShell";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Create account" };

export default function Register() {
  return (
    <AuthShell title="Create your free account" subtitle="Search players, give commendations and report responsibly. Two-factor authentication is required before you submit feedback.">
      <RegisterForm />
    </AuthShell>
  );
}
