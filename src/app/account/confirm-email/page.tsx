"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthShell } from "@/components/forms/AuthShell";
import { api, ClientApiError } from "@/lib/client";

function Inner() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<string | null>(null);
  return (
    <AuthShell title="Confirm new email">
      {state ? <p className="text-sm">{state}</p> : (
        <button className="btn-primary w-full" onClick={async () => {
          try { await api("/api/account/email/confirm", { body: { token } }); setState("Your email address has been updated."); }
          catch (e) { setState(e instanceof ClientApiError ? e.message : "Failed."); }
        }}>Confirm this email address</button>
      )}
    </AuthShell>
  );
}
export default function Page() { return <Suspense><Inner /></Suspense>; }
