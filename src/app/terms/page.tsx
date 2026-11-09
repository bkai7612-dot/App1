import type { Metadata } from "next";
import { Prose } from "@/components/ui/Prose";

export const metadata: Metadata = { title: "Terms of Use" };

export default function Terms() {
  return (
    <Prose title="Terms of Use" intro="Last updated: draft." draft>
      <h2>1. About us</h2><p>ServerSentry is operated by [OPERATOR LEGAL NAME, company number, registered address]. Contact: [CONTACT EMAIL].</p>
      <h2>2. Eligibility</h2><p>You must be 18 or over to create an account. One account per person.</p>
      <h2>3. Your account and security</h2><p>Keep your credentials and second factors secure. Two-factor authentication is mandatory before you can contribute content. Tell us immediately if you suspect your account is compromised.</p>
      <h2>4. User content</h2><p>You are responsible for content you submit. You grant us a licence to host, moderate, summarise and display it as described in these terms. Published reports are moderator-written summaries of community allegations. They are not statements of fact by ServerSentry.</p>
      <h2>5. Moderation</h2><p>We may refuse, edit (by summarising), remove or restrict content and accounts in line with the Community Guidelines. Affected players have a right of reply and appeal.</p>
      <h2>6. ServerSentry Plus</h2>
      <ul><li>£0.99 per month, renewing monthly until cancelled. Cancel any time via the billing portal; access continues to the end of the paid period.</li>
        <li>Under the Consumer Contracts Regulations 2013 you have 14 days to cancel. If you ask us to start providing Plus immediately, you acknowledge that you may receive a proportionate refund only for the unused period. [Legal review required.]</li>
        <li>If a payment fails, Plus features pause until payment succeeds.</li>
        <li>Plus never gives access to evidence, unmoderated reports or reporter identities, and cannot be used to change anyone&apos;s reputation.</li></ul>
      <h2>7. Prohibited use</h2><p>No scraping, automated bulk access, attempts to bypass security or rate limits, harassment, or use of ServerSentry data to discriminate against, target or harass anyone.</p>
      <h2>8. Liability</h2><p>Nothing in these terms limits liability that cannot be limited by law, including under the Consumer Rights Act 2015. [Limitation wording subject to legal review.]</p>
      <h2>9. Complaints</h2><p>See <a href="/complaints">Complaints & content removal</a>.</p>
      <h2>10. Law</h2><p>These terms are governed by the laws of England and Wales. [Confirm jurisdiction coverage for Scotland and Northern Ireland consumers.]</p>
    </Prose>
  );
}
