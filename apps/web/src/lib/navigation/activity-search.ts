import type { ActivityKind } from "@clc/api/features/accounts/client";
import type { MessageContextInput } from "@clc/core/features/messaging/logic";
import { getAddress, isAddress } from "viem";

export const ACTIVITY_KIND_ORDER = [
  "creation",
  "sent",
  "received",
  "swapped",
  "deposited",
  "pool_payout",
] as const;

/** Date windows the desktop activity table filters its loaded rows by. */
export const ACTIVITY_RANGES = ["7d", "30d", "90d"] as const;
export type ActivityRange = (typeof ACTIVITY_RANGES)[number];

/** Activity's sub-tabs. `transactions` is the default and never written to the URL. */
export const ACTIVITY_SECTIONS = ["transactions", "messages", "notifications", "helpdesk"] as const;
export type ActivitySection = (typeof ACTIVITY_SECTIONS)[number];

export function parseActivitySection(value: unknown): ActivitySection {
  return (ACTIVITY_SECTIONS as readonly unknown[]).includes(value)
    ? (value as ActivitySection)
    : "transactions";
}

export type ActivityRouteSearch = {
  /** Activity's sub-tab; absent is Transactions. */
  section?: string;
  activityQ?: string | readonly string[];
  activityTypes?: string | readonly string[];
  /** Desktop only: one voucher's rows, by checksummed token address. */
  activityVoucher?: string | readonly string[];
  /** Desktop only: a date window over the loaded rows. */
  activityRange?: string | readonly string[];
  /** Selected activity row. Opening it pushes history so Back closes the inspector. */
  tx?: string;
  /** Resource-owner address used to prefill New message. */
  messageTo?: string | readonly string[];
  messageKind?: string | readonly string[];
  messageResource?: string | readonly string[];
  messageVoucher?: string | readonly string[];
  /** Admin/Superadmin Helpdesk conversation selected in Activity. */
  helpdeskId?: string | readonly string[];
  /** Admin/Superadmin Helpdesk queue; Open is the omitted default. */
  helpdeskStatus?: string | readonly string[];
  safe?: string | readonly string[];
  safeTx?: string | readonly string[];
};

export type ActivitySearch = {
  q: string;
  types: readonly ActivityKind[];
};

export function pickActivitySearch(search: unknown): ActivityRouteSearch {
  if (typeof search !== "object" || search === null) return {};
  const record = search as Record<string, unknown>;
  const activityQ = pickStringSearchValue(record.activityQ);
  const activityTypes = pickStringSearchValue(record.activityTypes);
  const activityVoucher = pickStringSearchValue(record.activityVoucher);
  const activityRange = pickStringSearchValue(record.activityRange);
  const tx = typeof record.tx === "string" && record.tx.length > 0 ? record.tx : undefined;
  const messageTo = pickStringSearchValue(record.messageTo);
  const messageKind = pickStringSearchValue(record.messageKind);
  const messageResource = pickPositiveIntegerSearchValue(record.messageResource);
  const messageVoucher = pickStringSearchValue(record.messageVoucher);
  const helpdeskId = pickPositiveIntegerSearchValue(record.helpdeskId);
  const helpdeskStatus = pickStringSearchValue(record.helpdeskStatus);
  const safe = pickStringSearchValue(record.safe);
  const safeTx = pickStringSearchValue(record.safeTx);
  const section = typeof record.section === "string" ? record.section : undefined;
  return {
    ...(section !== undefined ? { section } : {}),
    ...(activityQ !== undefined ? { activityQ } : {}),
    ...(activityTypes !== undefined ? { activityTypes } : {}),
    ...(activityVoucher !== undefined ? { activityVoucher } : {}),
    ...(activityRange !== undefined ? { activityRange } : {}),
    ...(tx !== undefined ? { tx } : {}),
    ...(messageTo !== undefined ? { messageTo } : {}),
    ...(messageKind !== undefined ? { messageKind } : {}),
    ...(messageResource !== undefined ? { messageResource } : {}),
    ...(messageVoucher !== undefined ? { messageVoucher } : {}),
    ...(helpdeskId !== undefined ? { helpdeskId } : {}),
    ...(helpdeskStatus !== undefined ? { helpdeskStatus } : {}),
    ...(safe !== undefined ? { safe } : {}),
    ...(safeTx !== undefined ? { safeTx } : {}),
  };
}

export function parseActivitySearch(search: unknown): ActivitySearch {
  const raw = pickActivitySearch(search);
  const rawQueries = toValues(raw.activityQ);
  const q = (rawQueries.find((value) => value.trim() !== "") ?? "")
    .trim()
    .replace(/\s+/gu, " ")
    .slice(0, 66);
  const selected = new Set<ActivityKind>();
  for (const value of toValues(raw.activityTypes)) {
    for (const part of value.split(",")) {
      const kind = part.trim().toLowerCase();
      if ((ACTIVITY_KIND_ORDER as readonly string[]).includes(kind)) {
        selected.add(kind as ActivityKind);
      }
    }
  }
  return { q, types: ACTIVITY_KIND_ORDER.filter((kind) => selected.has(kind)) };
}

export function parseActivityDeskFilters(search: unknown): {
  voucher?: `0x${string}`;
  range?: ActivityRange;
} {
  const raw = pickActivitySearch(search);
  const voucherValue = toValues(raw.activityVoucher)[0];
  const rangeValue = toValues(raw.activityRange)[0];
  return {
    voucher:
      voucherValue !== undefined && isAddress(voucherValue, { strict: false })
        ? getAddress(voucherValue)
        : undefined,
    range: (ACTIVITY_RANGES as readonly string[]).includes(rangeValue ?? "")
      ? (rangeValue as ActivityRange)
      : undefined,
  };
}

export function canonicalActivityRouteSearch(search: unknown): ActivityRouteSearch | null {
  const raw = pickActivitySearch(search);
  const parsed = parseActivitySearch(raw);
  const desk = parseActivityDeskFilters(raw);
  const section = parseActivitySection(raw.section);
  const messageTo = parseActivityMessageTo(raw.messageTo);
  const messageContext = parseActivityMessageContext(raw);
  const postContactId = parseActivityPostContact(raw);
  const helpdeskId = parseActivityHelpdeskId(raw.helpdeskId);
  const helpdeskStatus = parseActivityHelpdeskStatus(raw.helpdeskStatus);
  const safe = parseActivitySafeTarget(raw);
  const canonical: ActivityRouteSearch = {
    section: section === "transactions" ? undefined : section,
    activityQ: parsed.q || undefined,
    activityTypes: parsed.types.length ? parsed.types.join(",") : undefined,
    ...(raw.activityVoucher !== undefined ? { activityVoucher: desk.voucher } : {}),
    ...(raw.activityRange !== undefined ? { activityRange: desk.range } : {}),
    ...(raw.messageTo !== undefined ? { messageTo } : {}),
    ...(raw.messageKind !== undefined
      ? { messageKind: postContactId ? "post" : messageContext?.kind }
      : {}),
    ...(raw.messageResource !== undefined
      ? { messageResource: postContactId ?? messageContext?.resourceId }
      : {}),
    ...(raw.messageVoucher !== undefined
      ? {
          messageVoucher:
            messageContext?.kind === "pool" ? messageContext.proposedVoucherAddress : undefined,
        }
      : {}),
    ...(raw.helpdeskId !== undefined
      ? { helpdeskId: helpdeskId ? String(helpdeskId) : undefined }
      : {}),
    ...(raw.helpdeskStatus !== undefined
      ? { helpdeskStatus: helpdeskStatus === "resolved" ? "resolved" : undefined }
      : {}),
    ...(raw.safe !== undefined ? { safe: safe?.safe } : {}),
    ...(raw.safeTx !== undefined ? { safeTx: safe?.safeTx } : {}),
  };
  if (
    raw.section === canonical.section &&
    raw.activityQ === canonical.activityQ &&
    raw.activityTypes === canonical.activityTypes &&
    raw.activityVoucher === canonical.activityVoucher &&
    raw.activityRange === canonical.activityRange &&
    raw.messageTo === canonical.messageTo &&
    raw.messageKind === canonical.messageKind &&
    raw.messageResource === canonical.messageResource &&
    raw.messageVoucher === canonical.messageVoucher &&
    raw.helpdeskId === canonical.helpdeskId &&
    raw.helpdeskStatus === canonical.helpdeskStatus &&
    raw.safe === canonical.safe &&
    raw.safeTx === canonical.safeTx
  ) {
    return null;
  }
  return canonical;
}

export function parseActivityHelpdeskId(value: unknown): number | undefined {
  const raw = toValues(pickPositiveIntegerSearchValue(value))[0];
  if (!raw || !/^[1-9][0-9]*$/.test(raw)) return undefined;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : undefined;
}

export function parseActivityHelpdeskStatus(value: unknown): "open" | "resolved" {
  return toValues(pickStringSearchValue(value))[0] === "resolved" ? "resolved" : "open";
}

export function clearActivityRouteSearch(): ActivityRouteSearch {
  return {
    section: undefined,
    activityQ: undefined,
    activityTypes: undefined,
    activityVoucher: undefined,
    activityRange: undefined,
    tx: undefined,
    messageTo: undefined,
    messageKind: undefined,
    messageResource: undefined,
    messageVoucher: undefined,
    helpdeskId: undefined,
    helpdeskStatus: undefined,
    safe: undefined,
    safeTx: undefined,
  };
}

export function parseActivitySafeTarget(
  value: unknown,
): { safe: `0x${string}`; safeTx: `0x${string}` } | undefined {
  const raw = pickActivitySearch(value);
  const safe = toValues(raw.safe)[0];
  const safeTx = toValues(raw.safeTx)[0];
  if (
    !safe ||
    !safeTx ||
    !isAddress(safe, { strict: false }) ||
    !/^0x[a-fA-F0-9]{64}$/.test(safeTx)
  ) {
    return undefined;
  }
  return { safe: getAddress(safe), safeTx: safeTx.toLowerCase() as `0x${string}` };
}

export function parseActivityMessageContext(value: unknown): MessageContextInput | undefined {
  const raw = pickActivitySearch(value);
  const kind = toValues(raw.messageKind)[0];
  const resourceId = toValues(raw.messageResource)[0];
  const proposedVoucherAddress = toValues(raw.messageVoucher)[0];
  if (!kind || !resourceId) return undefined;
  if (kind === "pool" || kind === "voucher") {
    if (!isAddress(resourceId, { strict: false })) return undefined;
    const canonicalResource = getAddress(resourceId);
    if (kind === "voucher") return { kind, resourceId: canonicalResource };
    return {
      kind,
      resourceId: canonicalResource,
      ...(proposedVoucherAddress && isAddress(proposedVoucherAddress, { strict: false })
        ? { proposedVoucherAddress: getAddress(proposedVoucherAddress) }
        : {}),
    };
  }
  if ((kind === "want" || kind === "catalog") && /^[1-9][0-9]*$/.test(resourceId)) {
    return { kind, resourceId };
  }
  return undefined;
}

export function parseActivityPostContact(value: unknown): string | undefined {
  const raw = pickActivitySearch(value);
  const id = toValues(raw.messageResource)[0];
  return toValues(raw.messageKind)[0] === "post" && id && /^[1-9][0-9]*$/.test(id) ? id : undefined;
}

export function parseActivityMessageTo(value: unknown): `0x${string}` | undefined {
  const candidate = toValues(
    typeof value === "string" || Array.isArray(value)
      ? (value as string | readonly string[])
      : undefined,
  )[0];
  return candidate && isAddress(candidate, { strict: false }) ? getAddress(candidate) : undefined;
}

function pickStringSearchValue(value: unknown): string | readonly string[] | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((entry): entry is string => typeof entry === "string")) {
    return value;
  }
  return value === undefined ? undefined : ["__invalid__"];
}

function pickPositiveIntegerSearchValue(value: unknown): string | readonly string[] | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  return pickStringSearchValue(value);
}

function toValues(value: string | readonly string[] | undefined): readonly string[] {
  if (value === undefined) return [];
  return typeof value === "string" ? [value] : value;
}
