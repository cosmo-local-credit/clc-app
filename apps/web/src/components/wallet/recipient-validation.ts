export function normalizePhone(value: string): string {
  return value.replace(/[+\s()-]/g, "");
}

export function normalizeScannedRecipient(value: string): string {
  const address = value.match(/0x[a-fA-F0-9]{40}/)?.[0];
  return address ?? value.trim();
}

export function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export function isPhone(value: string): boolean {
  return /^\+?[0-9\s()-]*[0-9][0-9\s()-]*$/.test(value.trim());
}
