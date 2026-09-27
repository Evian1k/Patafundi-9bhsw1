/**
 * Single source of truth for money rendering (master prompt: design system +
 * globalization). Every KES/currency string in the app should go through
 * formatMoney — never hardcode "KES" again.
 */
export type CurrencyCode = string;

const SYMBOLS: Record<string, string> = {
  KES: "KSh",
  USD: "$",
  EUR: "€",
  GBP: "£",
  UGX: "USh",
  TZS: "TSh",
  RWF: "FRw",
  NGN: "₦",
  ZAR: "R",
  INR: "₹",
  AED: "د.إ",
};

/** Symbol/code hint for a currency. Falls back to the raw code. */
export function currencySymbol(currency: CurrencyCode = "KES"): string {
  return SYMBOLS[currency?.toUpperCase?.() ?? "KES"] ?? currency;
}

const FORMATTER_CACHE = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: CurrencyCode, locale?: string): Intl.NumberFormat {
  const key = `${currency}:${locale ?? "default"}`;
  let fmt = FORMATTER_CACHE.get(key);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat(locale ?? "en-KE", {
        style: "currency",
        currency: currency || "KES",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    } catch {
      fmt = new Intl.NumberFormat("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }
    FORMATTER_CACHE.set(key, fmt);
  }
  return fmt;
}

/**
 * Format an amount in the given currency.
 * "KES 12,500" style (symbol prefix, no decimals when whole).
 */
export function formatMoney(amount: number | string | null | undefined, currency: CurrencyCode = "KES", locale?: string): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return `${currencySymbol(currency)} 0`;
  const upper = (currency || "KES").toUpperCase();
  try {
    // Intl currency style puts "KSh 12,500" for en-KE — normalize spacing.
    return formatterFor(upper, locale).format(n).replace(/\u00a0/g, " ");
  } catch {
    return `${currencySymbol(upper)} ${n.toLocaleString()}`;
  }
}

/** Back-compat helper for legacy call sites that assume KES. */
export function formatKes(amount: number | string | null | undefined, locale?: string): string {
  return formatMoney(amount, "KES", locale);
}
