/**
 * Phone normalization. Phones are never keys: we keep the channel's original
 * identifier and store this canonical form only for matching and display.
 *
 * Brazil: mobile numbers have 9 local digits starting with 9. WhatsApp often
 * reports older accounts without the 9th digit (e.g. 55 48 9999-0000 as
 * 554899990000), so 8-digit numbers that look like mobiles (start 6-9) get
 * the 9 added back. Landlines (start 2-5) keep 8 digits.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return null;

  let national: string;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    national = digits.slice(2);
  } else if (!raw.trim().startsWith("+") && (digits.length === 10 || digits.length === 11)) {
    national = digits; // BR number without country code
  } else {
    return digits; // other country: keep as-is
  }

  // Brazilian area codes have no zeros (11-99).
  const ddd = national.slice(0, 2);
  if (ddd.includes("0")) return digits;
  let local = national.slice(2);

  if (local.length === 8 && /^[6-9]/.test(local)) local = `9${local}`;
  return `55${ddd}${local}`;
}

export function isBrazilianMobile(normalized: string): boolean {
  return /^55[1-9]{2}9\d{8}$/.test(normalized);
}
