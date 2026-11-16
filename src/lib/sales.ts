/**
 * The sales WhatsApp: where the home page sends people who want to try Fidera.
 * Set NEXT_PUBLIC_SALES_WHATSAPP to the number with country and area code
 * (e.g. 5548999990000). Without it, the buttons fall back to the signup page.
 */
export const SIGNUP_PATH = "/login?mode=signup";

export const TRIAL_MESSAGE = "Oi! Vi o Fidera e quero testar 7 dias grátis no meu salão.";

export function salesWhatsAppUrl(
  text: string = TRIAL_MESSAGE,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const digits = (env.NEXT_PUBLIC_SALES_WHATSAPP ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
