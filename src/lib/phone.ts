/** Normalise to WhatsApp's wa_id form: digits only, with country code, no plus. */
export function toWaId(input: string, defaultCountry = "91"): string | null {
  let d = input.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.length === 10) d = defaultCountry + d;
  else if (d.length === 11 && d.startsWith("0")) d = defaultCountry + d.slice(1);
  d = d.replace(/\D/g, "");
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

export function formatWaId(waId: string): string {
  if (waId.startsWith("91") && waId.length === 12) return `+91 ${waId.slice(2, 7)} ${waId.slice(7)}`;
  return `+${waId}`;
}
