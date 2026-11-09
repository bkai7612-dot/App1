"use client";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export function MarkAllRead() {
  const router = useRouter();
  return <button className="btn-ghost" onClick={async () => { await api("/api/notifications", { body: { all: true } }); router.refresh(); }}>Mark all read</button>;
}
