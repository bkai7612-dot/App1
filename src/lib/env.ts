import "server-only";

/**
 * Server-side configuration. Never import this from a client component.
 * Secrets are read lazily so a missing optional integration does not crash the app;
 * missing REQUIRED secrets fail fast at first use.
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") throw new Error(`Missing required environment variable ${name}`);
  return v;
}
function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : undefined;
}

export const env = {
  get databaseUrl() { return required("DATABASE_URL"); },
  get appUrl() { return (optional("APP_URL") ?? "http://localhost:3000").replace(/\/$/, ""); },
  get launchMode(): "development" | "staging" | "production" {
    const m = optional("SS_LAUNCH_MODE") ?? "development";
    return m === "production" || m === "staging" ? m : "development";
  },
  /** 32-byte key (base64) used for AES-256-GCM encryption of TOTP secrets. */
  get encryptionKey() { return required("APP_ENCRYPTION_KEY"); },
  /** Pepper/HMAC secret for hashing tokens, recovery codes and IP addresses. */
  get hmacSecret() { return required("APP_HMAC_SECRET"); },
  get webauthnRpId() { return optional("WEBAUTHN_RP_ID") ?? new URL(this.appUrl).hostname; },
  get webauthnRpName() { return "ServerSentry"; },
  get stripeSecretKey() { return optional("STRIPE_SECRET_KEY"); },
  get stripeWebhookSecret() { return optional("STRIPE_WEBHOOK_SECRET"); },
  get stripePricePlusMonthly() { return optional("STRIPE_PRICE_ID_PLUS_MONTHLY"); },
  get storageDriver(): "local" | "supabase" { return optional("STORAGE_DRIVER") === "supabase" ? "supabase" : "local"; },
  get localStorageDir() { return optional("LOCAL_STORAGE_DIR") ?? "./storage"; },
  get supabaseUrl() { return optional("SUPABASE_URL"); },
  /** Service-role key: SERVER ONLY. Never prefix with NEXT_PUBLIC_. */
  get supabaseServiceRoleKey() { return optional("SUPABASE_SERVICE_ROLE_KEY"); },
  get supabaseEvidenceBucket() { return optional("SUPABASE_EVIDENCE_BUCKET") ?? "evidence"; },
  get resendApiKey() { return optional("RESEND_API_KEY"); },
  get emailFrom() { return optional("EMAIL_FROM") ?? "ServerSentry <no-reply@localhost>"; },
  get cronSecret() { return optional("CRON_SECRET"); },
  get steamWebApiKey() { return optional("STEAM_WEB_API_KEY"); },
  /** Discord OAuth app (automatic gaming-account verification). Secret is SERVER ONLY. */
  get discordClientId() { return optional("DISCORD_CLIENT_ID"); },
  get discordClientSecret() { return optional("DISCORD_CLIENT_SECRET"); },
  /** Battle.net OAuth app (official BattleTag verification). Secret is SERVER ONLY. */
  get battlenetClientId() { return optional("BATTLENET_CLIENT_ID"); },
  get battlenetClientSecret() { return optional("BATTLENET_CLIENT_SECRET"); },
  get adminRequirePasskey() { return (optional("ADMIN_REQUIRE_PASSKEY") ?? "true") !== "false"; },
  get reportMinAccountAgeHours() { return Number(optional("REPORT_MIN_ACCOUNT_AGE_HOURS") ?? "24"); },
  get launchGatesApproved(): string[] {
    return (optional("SS_LAUNCH_GATES_APPROVED") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  },
  get isProduction() { return process.env.NODE_ENV === "production"; },
};
