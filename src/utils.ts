import crypto from "node:crypto";

/**
 * Generate a hash from an object
 * @param object Object to hash
 * @returns Hash string
 */
export function hashObject(object: Record<string, any>): string {
  if (typeof object != "object") {
    throw new TypeError("Object expected");
  }

  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(object), "utf8")
    .digest("hex" as crypto.BinaryToTextEncoding);

  return hash;
}

/**
 * Convert a date from Yuh format
 * @param s Date as string
 * @returns Parsed Date
 */
export function string2date(s: string): Date {
  const dd = parseInt(s.slice(0, 2));
  const mm = parseInt(s.slice(3, 5));
  const yy = parseInt(s.slice(6));
  return new Date(yy, mm - 1, dd, 12);
}

/**
 * Convert encoding of special characters
 * @param s String to convert
 * @returns Converted string
 */
export function convertEncoding(s: string): string {
  return s
    .replaceAll("‡", "à")
    .replaceAll("È", "é")
    .replaceAll("Í", "ê")
    .replaceAll("Ù", "ô")
    .replaceAll("…", "É");
}

/**
 * Parse a fixed point number
 * @param text Text to parse
 * @returns Parsed number
 */
export function parseFixed(text: string): number {
  text = text.trim();
  const minus = text[0] == "-";
  const integerPart = text.slice(0, -3);
  const decimalPart = text.slice(-2);
  const integerValue = parseInt(
    integerPart.replaceAll(",", "").replaceAll("'", ""),
  );
  const decimalValue = parseInt(decimalPart);
  const result = integerValue + (minus ? -decimalValue : decimalValue) / 100;
  return result;
}
