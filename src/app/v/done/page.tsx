import type { Metadata } from "next";
import { AuthShell } from "@/components/forms/AuthShell";

export const metadata: Metadata = { title: "Verification", robots: { index: false } };
const MSG: Record<string, [string, string]> = {
  ok: ["Verified!", "Your account is verified. You can close this page; your computer has updated automatically."],
  review: ["Almost there", "Sign-in worked, but the account name didn't match exactly, so a moderator will check it. You can close this page."],
  taken: ["Already verified elsewhere", "That account is already verified on another ServerSentry profile. Contact support if that's wrong."],
  noconnection: ["No connection found", "Your Discord account has no verified connection for this platform. Connect it in Discord (User Settings → Connections), then try again."],
  cancelled: ["Cancelled", "Nothing was changed."],
};
export default async function Done({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const r = sp.steam ?? sp.discord ?? sp.battlenet ?? "";
  const [title, text] = MSG[r] ?? ["Something went wrong", "Nothing was changed. Go back to your computer and try again."];
  return <AuthShell title={title}><p className="text-sm text-text-muted">{text}</p></AuthShell>;
}
