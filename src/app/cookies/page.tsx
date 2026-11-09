import type { Metadata } from "next";
import { Prose } from "@/components/ui/Prose";

export const metadata: Metadata = { title: "Cookies" };

export default function Cookies() {
  return (
    <Prose title="Cookies" intro="ServerSentry uses only strictly necessary cookies. We don't use analytics, advertising or tracking cookies.">
      <table><thead><tr><th>Name</th><th>Purpose</th><th>Duration</th><th>Type</th></tr></thead><tbody>
        <tr><td>__Host-ss_session (ss_session in development)</td><td>Keeps you signed in securely (HttpOnly, Secure, SameSite=Lax)</td><td>Up to 7 days (8 hours for staff)</td><td>Strictly necessary</td></tr>
        <tr><td>ss_consent</td><td>Remembers that you&apos;ve seen the cookie notice</td><td>180 days</td><td>Strictly necessary</td></tr>
        <tr><td>Stripe cookies (on checkout.stripe.com only)</td><td>Payment fraud prevention on Stripe&apos;s hosted checkout</td><td>Set by Stripe</td><td>Third-party, strictly necessary for payment</td></tr>
      </tbody></table>
      <p>If we ever add optional cookies, we will ask for your consent first, they will be off by default, and you will be able to withdraw consent at any time. Using ServerSentry will never depend on accepting optional cookies.</p>
      <p>To clear the notice preference, delete the ss_consent cookie in your browser settings.</p>
    </Prose>
  );
}
