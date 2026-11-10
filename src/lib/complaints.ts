export const COMPLAINT_CATEGORIES = ["illegal_content", "inaccurate_or_defamatory", "moderation_decision", "account_restriction", "data_protection", "other"] as const;
export const COMPLAINT_LABELS: Record<(typeof COMPLAINT_CATEGORIES)[number], string> = {
  illegal_content: "Illegal content (threats, doxxing, hate, sexual content)",
  inaccurate_or_defamatory: "Inaccurate or defamatory content about me",
  moderation_decision: "A moderation decision",
  account_restriction: "A restriction or suspension on my account",
  data_protection: "How my personal data is handled",
  other: "Something else",
};
