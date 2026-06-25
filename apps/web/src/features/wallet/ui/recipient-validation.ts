export function formatAddressInput(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export function normalizePhone(value: string): string {
  return value.replace(/[\s()-]/g, "");
}

export function normalizeScannedRecipient(value: string): string {
  const address = value.match(/0x\S{40}/)?.[0];
  return address ?? value.trim();
}

export function isAddress(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("0x") && trimmed.length === 42;
}

export function isPhone(value: string): boolean {
  const normalized = normalizePhone(value);
  return /^\+254\d{9}$/.test(normalized) || /^0\d{9}$/.test(normalized);
}

export function isEns(value: string): boolean {
  return /^[a-zA-Z0-9-]+\.(eth|sarafu\.eth)$/.test(value.trim());
}

export function isEnsCandidate(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3) return false;
  if (trimmed.includes(".")) return false;
  if (trimmed.toLowerCase().startsWith("0x")) return false;
  if (normalizePhone(trimmed).startsWith("+254")) return false;
  if (/^\d[\d\s-]{2}/.test(trimmed)) return false;
  return /^[a-zA-Z0-9-]+$/.test(trimmed);
}
