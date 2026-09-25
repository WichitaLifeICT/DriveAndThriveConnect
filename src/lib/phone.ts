/**
 * Normalize a US phone number to "(316) 555-1234". Returns null for an
 * empty value and throws for something that isn't a 10-digit US number.
 */
export function normalizeUsPhone(input: string | null | undefined): string | null {
  const raw = (input || "").trim();
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10 || /^[01]/.test(digits)) {
    throw new Error("Please enter a valid 10-digit US phone number.");
  }
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** "(316) 555-1234" -> "+13165551234" for tel:/sms: links. */
export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}
