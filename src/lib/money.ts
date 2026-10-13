/** All money in FarmHisab is stored as integer paise (1 rupee = 100 paise). */

export function formatINR(paise: number): string {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const hasPaise = abs % 100 !== 0;
  const body = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(abs / 100);
  return `${neg ? "−" : ""}₹${body}`;
}

/** Parses "1,250", "1250.5", "₹ 1250.50" into integer paise. Returns null if invalid. */
export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(paise) ? paise : null;
}

export function paiseToRupeesString(paise: number): string {
  const whole = Math.floor(Math.abs(paise) / 100);
  const frac = Math.abs(paise) % 100;
  return frac ? `${whole}.${String(frac).padStart(2, "0")}` : String(whole);
}
