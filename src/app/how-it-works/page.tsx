import type { Metadata } from "next";
import { Prose } from "@/components/ui/Prose";

export const metadata: Metadata = { title: "How It Works" };

export default function HowItWorks() {
  return (
    <Prose title="How ServerSentry works" intro="A community reputation network built around moderation, fairness and the right of reply.">
      <h2>1. Player profiles</h2>
      <p>A player profile represents one gaming identity: a username on a specific game and platform. Anyone signed in with two-factor authentication can add a player who isn&apos;t listed yet. Profiles with the same username are <strong>never merged automatically</strong>. Each has its own ServerSentry ID.</p>
      <h2>2. Identity status</h2>
      <ul>
        <li><strong>Verified:</strong> ownership confirmed, and the badge always says how: the platform&apos;s official sign-in (Steam, Battle.net), a Discord-verified connection (PlayStation, Xbox, Riot, Epic and others), or a moderator-confirmed profile code.</li>
        <li><strong>Possible match:</strong> a moderator saw supporting signals, but ownership isn&apos;t confirmed.</li>
        <li><strong>Unverified:</strong> identified by username only. It may not belong to the person you think.</li>
        <li><strong>Unlinked:</strong> the owner removed the link.</li>
      </ul>
      <h2>3. Commendations</h2>
      <p>Recognise good teammates in one click. You can give each player one commendation a day, and each type only once ever, so at most seven per player. Commendations from accounts under three days old are checked first. Written comments are a Plus feature and are always checked by a moderator.</p>
      <h2>Votes</h2>
      <p>Any member with two-factor authentication can upvote or downvote a player once, and change or remove that vote any time. Who voted is private. Votes from accounts under three days old are saved but only count after three days, and moderators are alerted to sudden pile-ons.</p>
      <h2>4. Reports</h2>
      <p>Reports are private when submitted, and they don&apos;t change anyone&apos;s public numbers until a moderator publishes them. A moderator reviews each one, may ask for more information, and either rejects it or publishes a <strong>neutral, moderator-written summary</strong>. We never publish the reporter&apos;s identity, their raw description or any evidence.</p>
      <p>Published reports are labelled clearly:</p>
      <ul>
        <li><strong>Allegation:</strong> a moderated community report. It is not proof of misconduct.</li>
        <li><strong>Disputed allegation / under appeal:</strong> the player has responded or appealed.</li>
        <li><strong>Resolved moderation outcome:</strong> a moderator decision after review. It is not a legal finding.</li>
      </ul>
      <h2>5. Right of reply and appeals</h2>
      <p>If you own a profile, you can read every published report about it, post a response and appeal, all for free. A different, senior moderator decides appeals.</p>
      <h2>6. What we don&apos;t do</h2>
      <ul>
        <li>No single &ldquo;reputation score&rdquo;, and no &ldquo;worst players&rdquo; leaderboards.</li>
        <li>No paying to remove reports or boost reputation.</li>
        <li>No scraping private data, bypassing anti-cheat or reading game memory.</li>
      </ul>
    </Prose>
  );
}
