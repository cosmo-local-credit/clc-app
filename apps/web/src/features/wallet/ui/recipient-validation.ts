export function formatAddressInput(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export type RecipientSearchKind = "phone" | "email" | "ens";

export type ParsedRecipientInput =
  | { kind: "address"; address: `0x${string}` }
  | { kind: RecipientSearchKind; query: string }
  | { kind: "unknown" };

// Send-to has no selected country, so only explicit international prefixes
// can be normalized safely. National 0... numbers remain unchanged.
export function normalizePhone(value: string): string {
  const compact = value.trim().replace(/[\s()-]/g, "");
  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  if (/^[1-9]/.test(compact)) return `+${compact}`;
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
  return /^\+[1-9]\d{2,14}$/.test(normalizePhone(value));
}

export function isEns(value: string): boolean {
  return /^[a-zA-Z0-9-]+\.(eth|sarafu\.eth)$/.test(value.trim());
}

export function isEnsCandidate(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3) return false;
  if (trimmed.includes(".")) return false;
  if (trimmed.toLowerCase().startsWith("0x")) return false;
  if (/^\d[\d\s-]{2}/.test(trimmed)) return false;
  return /^[a-zA-Z0-9-]+$/.test(trimmed);
}

export function parseRecipientInput(value: string): ParsedRecipientInput {
  const trimmed = value.trim();
  if (!trimmed) return { kind: "unknown" };

  if (trimmed.toLowerCase().startsWith("0x")) {
    return isAddress(trimmed)
      ? { kind: "address", address: trimmed as `0x${string}` }
      : { kind: "unknown" };
  }

  if (trimmed.includes("@")) {
    const query = trimmed.toLowerCase();
    return query.length >= 3 && /^[^\s@]+@[^\s@]*$/.test(query)
      ? { kind: "email", query }
      : { kind: "unknown" };
  }

  if (/^[+\d][\d\s()-]*$/.test(trimmed)) {
    if (trimmed.replace(/\D/g, "").length < 3) return { kind: "unknown" };
    const query = normalizePhone(trimmed);
    return /^\+[1-9]\d{2,14}$/.test(query) ? { kind: "phone", query } : { kind: "unknown" };
  }

  const query = trimmed.toLowerCase();
  return query.length >= 3 && /^[a-z0-9-]+(?:\.[a-z0-9-]*)*$/.test(query)
    ? { kind: "ens", query }
    : { kind: "unknown" };
}
