import "server-only";

/**
 * L-01: legal operator details come from configuration, not hard-coded placeholders.
 * These are public facts (not secrets) but are kept server-side so a misconfiguration can be detected.
 */
const v = (k: string) => process.env[k]?.trim() || null;
export const OPERATOR = {
  name: v("OPERATOR_LEGAL_NAME"),
  companyNumber: v("OPERATOR_COMPANY_NUMBER"),
  address: v("OPERATOR_ADDRESS"),
  contactEmail: v("CONTACT_EMAIL"),
  privacyEmail: v("PRIVACY_EMAIL") ?? v("CONTACT_EMAIL"),
  complaintsEmail: v("COMPLAINTS_EMAIL") ?? v("CONTACT_EMAIL"),
  icoNumber: v("ICO_REGISTRATION_NUMBER"),
};
export const NOT_SET = "(not yet configured: set before launch)";
export const operatorConfigured = () => !!(OPERATOR.name && OPERATOR.address && OPERATOR.contactEmail && OPERATOR.icoNumber);
