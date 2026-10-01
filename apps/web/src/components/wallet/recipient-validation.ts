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
