import type { Metadata } from "next";
import { Prose } from "@/components/ui/Prose";

export const metadata: Metadata = { title: "Complaints & content removal" };

export default function Complaints() {
  return (
    <Prose title="Complaints & content removal" intro="How to challenge content or decisions on ServerSentry." draft>
      <h2>If a report is about you</h2>
      <ul><li>Claim your profile (official sign-in where available, otherwise moderator review).</li><li>Respond publicly to a published report, or appeal it. A different, senior moderator decides appeals.</li><li>Ask us to correct or remove inaccurate personal data via Account Settings &gt; Privacy &amp; data.</li></ul>
      <h2>If you can&apos;t claim the profile</h2><p>Email [COMPLAINTS EMAIL] with the profile ID and the content concerned. We will acknowledge you within 2 working days and aim to decide within 14 days.</p>
      <h2>Illegal content</h2><p>Report illegal content (e.g. threats, harassment, doxxing) to [COMPLAINTS EMAIL] with the profile ID. We prioritise these reports and remove illegal content swiftly once we are aware of it.</p>
      <h2>Complaints about moderation decisions</h2><p>You can complain about any moderation decision, including restrictions on your account. A moderator not involved in the original decision reviews it.</p>
      <h2>Escalation</h2><p>If you&apos;re unhappy with how we handled your personal data, you can complain to the Information Commissioner&apos;s Office.</p>
    </Prose>
  );
}
