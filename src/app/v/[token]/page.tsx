import type { Metadata } from "next";
import { AuthShell } from "@/components/forms/AuthShell";
import { withDb, SYSTEM } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { HandoffContinue } from "./HandoffContinue";

export const metadata: Metadata = { title: "Verify on your phone", robots: { index: false, follow: false } };
const LABEL: Record<string, string> = { steam_openid: "Steam", battlenet_oauth: "Battle.net", discord_connection: "Discord" };

export default async function Handoff({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = token.length >= 20 && token.length <= 100 ? await withDb(SYSTEM, (tx) => tx.one<{ method: string; kind: string; member: string; player: string; platform: string; account: string | null }>(
    `SELECT v.method, v.kind, u.display_name AS member, p.display_name AS player, pl.name AS platform, ga.username AS account
     FROM account_verifications v JOIN users u ON u.id = v.user_id JOIN player_profiles p ON p.id = v.player_profile_id
     JOIN platforms pl ON pl.id = p.platform_id LEFT JOIN gaming_accounts ga ON ga.id = v.gaming_account_id
     WHERE v.handoff_token_hash = $1 AND v.handoff AND v.status = 'pending' AND v.expires_at > now()`, [sha256(token)])) : null;
  if (!v) return <AuthShell title="Code expired"><p className="text-sm text-text-muted">This QR code has expired or was already used. Go back to your computer and generate a new one.</p></AuthShell>;
  return (
    <AuthShell title="Verify your account" subtitle={`You're verifying the ${v.platform} account "${v.account ?? v.player}" for ServerSentry.`}>
      <div className="space-y-4 text-sm">
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-amber-100">
          This will link it to the ServerSentry member <strong>{v.member}</strong>. Only continue if that&apos;s you and you started this on your own computer. If someone sent you this code, stop here.
        </div>
        <p className="text-text-muted">Next you&apos;ll sign in with {LABEL[v.method]}&apos;s official page (usually one tap if you&apos;re already signed in on this phone). ServerSentry never sees your password.</p>
        <HandoffContinue token={token} provider={LABEL[v.method]} />
      </div>
    </AuthShell>
  );
}
