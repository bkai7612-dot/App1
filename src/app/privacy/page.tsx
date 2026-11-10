import { OPERATOR, NOT_SET } from "@/lib/operator";
import type { Metadata } from "next";
import { Prose } from "@/components/ui/Prose";

export const metadata: Metadata = { title: "Privacy Notice" };

export default function Privacy() {
  return (
    <Prose title="Privacy Notice" intro="How ServerSentry uses personal data, under UK GDPR and the Data Protection Act 2018." draft>
      <h2>Controller</h2><p>{OPERATOR.name ?? NOT_SET}, {OPERATOR.address ?? NOT_SET}. Privacy contact: {OPERATOR.privacyEmail ?? NOT_SET}. ICO registration: {OPERATOR.icoNumber ?? NOT_SET}.</p>
      <h2>What we collect</h2>
      <table><thead><tr><th>Data</th><th>Purpose</th><th>Lawful basis (proposed)</th></tr></thead><tbody>
        <tr><td>Account data (email, display name, password hash, MFA credentials)</td><td>Provide and secure your account</td><td>Contract; legitimate interests (security)</td></tr>
        <tr><td>Security logs (hashed IP, browser type, sign-in events)</td><td>Fraud and account-takeover prevention</td><td>Legitimate interests</td></tr>
        <tr><td>Player profiles (gaming usernames, public platform IDs)</td><td>Community reputation network</td><td>Legitimate interests (balancing test required)</td></tr>
        <tr><td>Commendations and reports you submit, plus evidence</td><td>Moderation and publication of summaries</td><td>Legitimate interests</td></tr>
        <tr><td>Reports about a player profile</td><td>Community safety information</td><td>Legitimate interests (DPIA required)</td></tr>
        <tr><td>Subscription status and invoices (no card numbers)</td><td>Billing</td><td>Contract; legal obligation (tax records)</td></tr>
      </tbody></table>
      <h2>What we never collect or publish</h2><p>Home addresses, phone numbers, identity documents, platform passwords, or card numbers. We publish no reporter identities, raw allegations or evidence.</p>
      <h2>Recipients</h2><p>Processors: hosting (Vercel), database and storage (Supabase), payments (Stripe), email (Resend). [List regions and transfer safeguards after vendor review.]</p>
      <h2>Retention</h2><p>See the retention schedule in our records. In summary: rejected or removed report evidence is deleted after 90 days; resolved-report evidence after 180 days; deleted accounts are purged after 30 days; security logs are kept for 12 months; billing records for 6 years.</p>
      <h2>Your rights</h2><p>You can access, correct, erase, restrict, object to, or port your data. Use <a href="/account/privacy">Privacy & data</a> in your account, or email us. Some data may be kept where an exemption applies (for example, to keep moderation decisions accurate). We will explain this when it applies. You can complain to the ICO (ico.org.uk).</p>
      <h2>If you are the subject of a report</h2><p>You can see published reports about profiles you own, respond, appeal, and ask us to correct or remove inaccurate information. Reporter identities are withheld to protect reporters, in line with UK GDPR exemptions for third-party data. [Legal review required.]</p>
      <h2>Cookies</h2><p>Essential cookies only. See <a href="/cookies">Cookies</a>.</p>
    </Prose>
  );
}
