import type { Metadata } from "next";
import { Prose } from "@/components/ui/Prose";
import { getAuth } from "@/lib/auth/session";
import { OPERATOR, NOT_SET } from "@/lib/operator";
import { ComplaintForm } from "./ComplaintForm";

export const metadata: Metadata = { title: "Complaints & content removal" };

export default async function Complaints({ searchParams }: { searchParams: Promise<{ ref?: string; category?: string }> }) {
  const sp = await searchParams;
  const auth = await getAuth();
  const signedIn = !!auth && !auth.pendingMfa;
  return (
    <Prose title="Complaints & content removal" intro="How to challenge content or decisions on ServerSentry." draft>
      <h2>Send a complaint</h2>
      <p>Use this form for anything below. You don&apos;t need an account. We acknowledge complaints within 2 working days and aim to decide within 14 days. Illegal content is prioritised.</p>
      <ComplaintForm signedIn={signedIn} initialRef={(sp.ref ?? "").slice(0, 300)} initialCategory={sp.category ?? ""} />
      <p>Prefer email? Write to {OPERATOR.complaintsEmail ?? NOT_SET}.</p>
      <h2>If a report is about you</h2>
      <ul><li>Claim your profile (official sign-in where available, otherwise moderator review).</li><li>Respond publicly to a published report, or appeal it. A different, senior moderator decides appeals.</li><li>Ask us to correct or remove inaccurate personal data via Account Settings &gt; Privacy &amp; data.</li></ul>
      <h2>If you can&apos;t claim the profile</h2><p>Use the form above with the profile link and the content concerned.</p>
      <h2>Illegal content</h2><p>Report illegal content (for example threats, harassment or doxxing) with the form above, choosing &ldquo;Illegal content&rdquo;. We remove illegal content swiftly once we are aware of it.</p>
      <h2>Complaints about moderation decisions</h2><p>You can complain about any moderation decision, including restrictions on your account. A moderator not involved in the original decision reviews it.</p>
      <h2>Escalation</h2><p>If you&apos;re unhappy with how we handled your personal data, you can complain to the Information Commissioner&apos;s Office (ico.org.uk).</p>
    </Prose>
  );
}
