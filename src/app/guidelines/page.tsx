import type { Metadata } from "next";
import { Prose } from "@/components/ui/Prose";

export const metadata: Metadata = { title: "Community Guidelines" };

export default function Guidelines() {
  return (
    <Prose title="Community Guidelines" intro="ServerSentry only works if feedback is honest, fair and safe." draft>
      <h2>Be truthful</h2>
      <ul><li>Only report things you experienced first-hand.</li><li>Describe what happened factually. Don&apos;t speculate about motives or label people (&ldquo;cheater&rdquo;, &ldquo;criminal&rdquo;).</li><li>False, exaggerated or retaliatory reports are a serious breach.</li></ul>
      <h2>Protect privacy</h2>
      <ul><li>Never include real names, addresses, phone numbers, schools, workplaces, photos of people or other personal information.</li><li>Don&apos;t upload private messages from others unless strictly necessary to evidence harassment directed at you. Moderators will never publish them.</li><li>Never share someone&apos;s account credentials.</li></ul>
      <h2>No brigading</h2>
      <ul><li>Don&apos;t coordinate groups to report or commend a player.</li><li>Don&apos;t create multiple accounts. Our systems flag clusters of new accounts and repeated reporters.</li></ul>
      <h2>Commendations</h2>
      <ul><li>Commend real behaviour you saw. No trading or selling commendations.</li><li>Comments must be respectful and must not contain personal information.</li></ul>
      <h2>Not allowed anywhere on ServerSentry</h2>
      <ul><li>Hate speech, threats, harassment or doxxing.</li><li>Content involving or concerning the sexual exploitation of children (reported to the relevant authorities).</li><li>Encouraging self-harm or violence.</li><li>Spam, advertising or impersonation.</li></ul>
      <h2>Urgent safety concerns</h2>
      <p>ServerSentry is not an emergency service. If someone is in immediate danger, contact the emergency services (999 in the UK). You can also report illegal content to the game publisher and to the police.</p>
      <h2>Enforcement</h2>
      <p>Moderators may reject or remove content, restrict reporting, or suspend accounts. Decisions are recorded, and you can challenge them through the <a href="/complaints">complaints process</a>.</p>
    </Prose>
  );
}
