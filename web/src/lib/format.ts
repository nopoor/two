export function shortAddress(value?: string) {
  if (!value) return "--";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function formatToken(value?: bigint, decimals = 18, fractionDigits = 4) {
  if (value === undefined) return "--";
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  const fractionString = fraction.toString().padStart(decimals, "0").slice(0, fractionDigits);
  return `${whole.toString()}.${fractionString}`;
}

export function formatPercent(bps: number) {
  return `${(bps / 100).toFixed(2)}%`;
}
