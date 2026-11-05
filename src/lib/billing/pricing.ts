/**
 * Estimated Meta cost per API send in Brazil (BRL). Reference values from
 * PLANO.md; confirm against the official pricing table before charging
 * customers. Sending from the WhatsApp Business app is free and never
 * recorded here.
 */
export const PRICING_BRL = {
  /** Free-form reply inside the customer service window. */
  service: 0.035,
  /** Free service replies per phone number per month. */
  serviceFreeTierPerMonth: 1000,
  /** Utility template: treat as paid even inside the window. */
  utility: 0.035,
  marketing: 0.3217,
} as const;

export type SendCategory = "service" | "utility" | "marketing";

/**
 * @param sentThisMonth API sends of the same category already recorded for
 * this phone number in the current month.
 */
export function estimateSendCost(category: SendCategory, sentThisMonth: number): number {
  switch (category) {
    case "service":
      return sentThisMonth < PRICING_BRL.serviceFreeTierPerMonth ? 0 : PRICING_BRL.service;
    case "utility":
      return PRICING_BRL.utility;
    case "marketing":
      return PRICING_BRL.marketing;
  }
}
