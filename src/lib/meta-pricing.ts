/**
 * Approximate Meta per-message rates for India in paise, used only to show an
 * estimate before a broadcast is sent. Meta bills these directly; check the
 * current rate card at developers.facebook.com/docs/whatsapp/pricing.
 */
export const META_RATE_MINOR: Record<"MARKETING" | "UTILITY" | "AUTHENTICATION", number> = {
  MARKETING: 86,
  UTILITY: 12,
  AUTHENTICATION: 12,
};

export function estimateCost(category: keyof typeof META_RATE_MINOR, recipients: number): number {
  return META_RATE_MINOR[category] * recipients;
}
