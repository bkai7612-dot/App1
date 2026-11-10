/**
 * M-02: pre-publication safety checks for report summaries (shared by the moderator UI preview and the server).
 * These are warnings a moderator must acknowledge, not automatic decisions.
 */
export interface PublishContext { summary: string; evidenceCount: number; flags: string[]; identityVerified: boolean; category: string }

const ACCUSATORY = /\b(cheat(er|ers|ing)?\s+confirmed|is\s+a\s+(cheater|hacker|criminal|scammer|paedo\w*|pedo\w*|predator|thief)|criminal|convicted|guilty|stole|fraudster|scammer|paedo\w*|pedo\w*|groom\w*|rapist|terrorist)\b/i;
const PERSONAL = /([\w.+-]+@[\w-]+\.[\w.]+)|(\+?\d[\d\s().-]{8,}\d)|(https?:\/\/\S+)|(\b\d{1,4}\s+\w+\s+(street|st|road|rd|avenue|ave|lane|ln)\b)|(@\w{3,})/i;
// Categories where publishing without any evidence is high risk.
const EVIDENCE_EXPECTED = new Set(["suspected_cheating", "threats_intimidation", "harassment"]);

export function publishWarnings(c: PublishContext): string[] {
  const w: string[] = [];
  const s = c.summary.trim();
  if (!/^(a|one|several|multiple) (community )?members? (alleges?|allege|reported|report)/i.test(s))
    w.push("Frame it as an allegation, e.g. start with \"A community member alleges…\".");
  if (ACCUSATORY.test(s)) w.push("The summary contains words that state guilt or allege a crime (e.g. \"cheater\", \"criminal\", \"stole\"). Rephrase as an allegation about specific behaviour.");
  if (PERSONAL.test(s)) w.push("The summary looks like it contains personal information (email, phone, link, address or @handle). Remove it.");
  if (c.evidenceCount === 0 && EVIDENCE_EXPECTED.has(c.category)) w.push("No evidence was supplied for a category where we normally expect evidence.");
  if (c.flags.length > 0) w.push(`Abuse signals are present: ${c.flags.map((f) => f.replace(/_/g, " ")).join(", ")}.`);
  if (!c.identityVerified) w.push("The player's identity is unverified, so this may not be the person people assume. The public page will say so.");
  if (s.length < 40) w.push("The summary is very short; describe the specific alleged behaviour neutrally.");
  return w;
}
