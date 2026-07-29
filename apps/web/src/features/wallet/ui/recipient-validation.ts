export function normalizePhone(value: string): string {
  const compact = value.replace(/[\s()-]/g, "");
  if (/^0\d{9}$/.test(compact)) return `+254${compact.slice(1)}`;
  return compact;
}

export function normalizeScannedRecipient(value: string): string {
  const address = value.match(/0x[a-fA-F0-9]{40}/)?.[0];
  return address ?? value.trim();
}

export function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export function isPhone(value: string): boolean {
  return /^\+254\d{9}$/.test(normalizePhone(value));
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
