export function digits(currency: string) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function toMinor(value: string, currency: string) {
  const [whole, fraction = ''] = value.split('.');
  const places = digits(currency);
  if (!/^\d+(?:\.\d+)?$/.test(value) || fraction.length > places) return null;
  const result = Number(whole) * 10 ** places + Number(fraction.padEnd(places, '0'));
  return Number.isSafeInteger(result) && result > 0 && result <= 2_000_000_000 ? result : null;
}

export function money(value: number, currency: string) {
  return new Intl.NumberFormat('en-ZM', { style: 'currency', currency, currencyDisplay: 'code' })
    .format(value / 10 ** digits(currency));
}
