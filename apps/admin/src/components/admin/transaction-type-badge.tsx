import { Badge } from "#/components/ui/badge";
import { cn } from "#/lib/utils";

type TransactionTypeTone = {
  badge: string;
  filter: string;
  select: string;
};

/**
 * Type colours identify a transaction's kind. Outcome colour belongs only to
 * StateBadge, so a failed swap still reads as a swap before its status is read.
 */
const typeTones: Record<string, TransactionTypeTone> = {
  transfer: {
    badge:
      "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
    filter:
      "text-sky-800 hover:bg-sky-50 data-[pressed]:border-sky-300 data-[pressed]:bg-sky-50 dark:text-sky-200 dark:hover:bg-sky-950/40 dark:data-[pressed]:border-sky-800 dark:data-[pressed]:bg-sky-950/40",
    select:
      "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  },
  mint: {
    badge:
      "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    filter:
      "text-emerald-800 hover:bg-emerald-50 data-[pressed]:border-emerald-300 data-[pressed]:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-950/40 dark:data-[pressed]:border-emerald-800 dark:data-[pressed]:bg-emerald-950/40",
    select:
      "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  },
  burn: {
    badge:
      "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
    filter:
      "text-rose-800 hover:bg-rose-50 data-[pressed]:border-rose-300 data-[pressed]:bg-rose-50 dark:text-rose-200 dark:hover:bg-rose-950/40 dark:data-[pressed]:border-rose-800 dark:data-[pressed]:bg-rose-950/40",
    select:
      "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
  },
  swap: {
    badge:
      "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
    filter:
      "text-violet-800 hover:bg-violet-50 data-[pressed]:border-violet-300 data-[pressed]:bg-violet-50 dark:text-violet-200 dark:hover:bg-violet-950/40 dark:data-[pressed]:border-violet-800 dark:data-[pressed]:bg-violet-950/40",
    select:
      "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  },
  deposit: {
    badge:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    filter:
      "text-amber-800 hover:bg-amber-50 data-[pressed]:border-amber-300 data-[pressed]:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/40 dark:data-[pressed]:border-amber-800 dark:data-[pressed]:bg-amber-950/40",
    select:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  },
  TOKEN_PROXY_DEPLOY: {
    badge:
      "border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200",
    filter:
      "text-cyan-800 hover:bg-cyan-50 data-[pressed]:border-cyan-300 data-[pressed]:bg-cyan-50 dark:text-cyan-200 dark:hover:bg-cyan-950/40 dark:data-[pressed]:border-cyan-800 dark:data-[pressed]:bg-cyan-950/40",
    select:
      "border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200",
  },
  POOL_DEPLOY_STEP: {
    badge:
      "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
    filter:
      "text-blue-800 hover:bg-blue-50 data-[pressed]:border-blue-300 data-[pressed]:bg-blue-50 dark:text-blue-200 dark:hover:bg-blue-950/40 dark:data-[pressed]:border-blue-800 dark:data-[pressed]:bg-blue-950/40",
    select:
      "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  },
  POOL_PROXY_DEPLOY: {
    badge:
      "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200",
    filter:
      "text-indigo-800 hover:bg-indigo-50 data-[pressed]:border-indigo-300 data-[pressed]:bg-indigo-50 dark:text-indigo-200 dark:hover:bg-indigo-950/40 dark:data-[pressed]:border-indigo-800 dark:data-[pressed]:bg-indigo-950/40",
    select:
      "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200",
  },
  POOL_TOKEN_INDEX_DEPLOY: {
    badge:
      "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-800 dark:bg-fuchsia-950/40 dark:text-fuchsia-200",
    filter:
      "text-fuchsia-800 hover:bg-fuchsia-50 data-[pressed]:border-fuchsia-300 data-[pressed]:bg-fuchsia-50 dark:text-fuchsia-200 dark:hover:bg-fuchsia-950/40 dark:data-[pressed]:border-fuchsia-800 dark:data-[pressed]:bg-fuchsia-950/40",
    select:
      "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-800 dark:bg-fuchsia-950/40 dark:text-fuchsia-200",
  },
  POOL_LIMITER_DEPLOY: {
    badge:
      "border-pink-300 bg-pink-50 text-pink-800 dark:border-pink-800 dark:bg-pink-950/40 dark:text-pink-200",
    filter:
      "text-pink-800 hover:bg-pink-50 data-[pressed]:border-pink-300 data-[pressed]:bg-pink-50 dark:text-pink-200 dark:hover:bg-pink-950/40 dark:data-[pressed]:border-pink-800 dark:data-[pressed]:bg-pink-950/40",
    select:
      "border-pink-300 bg-pink-50 text-pink-800 dark:border-pink-800 dark:bg-pink-950/40 dark:text-pink-200",
  },
  POOL_FEE_POLICY_DEPLOY: {
    badge:
      "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
    filter:
      "text-orange-800 hover:bg-orange-50 data-[pressed]:border-orange-300 data-[pressed]:bg-orange-50 dark:text-orange-200 dark:hover:bg-orange-950/40 dark:data-[pressed]:border-orange-800 dark:data-[pressed]:bg-orange-950/40",
    select:
      "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
  },
  POOL_ORACLE_QUOTER_DEPLOY: {
    badge:
      "border-lime-300 bg-lime-50 text-lime-900 dark:border-lime-800 dark:bg-lime-950/40 dark:text-lime-200",
    filter:
      "text-lime-900 hover:bg-lime-50 data-[pressed]:border-lime-300 data-[pressed]:bg-lime-50 dark:text-lime-200 dark:hover:bg-lime-950/40 dark:data-[pressed]:border-lime-800 dark:data-[pressed]:bg-lime-950/40",
    select:
      "border-lime-300 bg-lime-50 text-lime-900 dark:border-lime-800 dark:bg-lime-950/40 dark:text-lime-200",
  },
  POOL_RELATIVE_QUOTER_DEPLOY: {
    badge:
      "border-purple-300 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200",
    filter:
      "text-purple-800 hover:bg-purple-50 data-[pressed]:border-purple-300 data-[pressed]:bg-purple-50 dark:text-purple-200 dark:hover:bg-purple-950/40 dark:data-[pressed]:border-purple-800 dark:data-[pressed]:bg-purple-950/40",
    select:
      "border-purple-300 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200",
  },
  PROXY_UPGRADE: {
    badge:
      "border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200",
    filter:
      "text-teal-800 hover:bg-teal-50 data-[pressed]:border-teal-300 data-[pressed]:bg-teal-50 dark:text-teal-200 dark:hover:bg-teal-950/40 dark:data-[pressed]:border-teal-800 dark:data-[pressed]:bg-teal-950/40",
    select:
      "border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200",
  },
  RELAY_DELEGATE: {
    badge:
      "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200",
    filter:
      "text-green-800 hover:bg-green-50 data-[pressed]:border-green-300 data-[pressed]:bg-green-50 dark:text-green-200 dark:hover:bg-green-950/40 dark:data-[pressed]:border-green-800 dark:data-[pressed]:bg-green-950/40",
    select:
      "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200",
  },
  RELAY_EXEC: {
    badge:
      "border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200",
    filter:
      "text-yellow-900 hover:bg-yellow-50 data-[pressed]:border-yellow-300 data-[pressed]:bg-yellow-50 dark:text-yellow-200 dark:hover:bg-yellow-950/40 dark:data-[pressed]:border-yellow-800 dark:data-[pressed]:bg-yellow-950/40",
    select:
      "border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200",
  },
  RELAY_DELEGATE_EXEC: {
    badge:
      "border-stone-300 bg-stone-50 text-stone-800 dark:border-stone-700 dark:bg-stone-950/40 dark:text-stone-200",
    filter:
      "text-stone-800 hover:bg-stone-50 data-[pressed]:border-stone-300 data-[pressed]:bg-stone-50 dark:text-stone-200 dark:hover:bg-stone-950/40 dark:data-[pressed]:border-stone-700 dark:data-[pressed]:bg-stone-950/40",
    select:
      "border-stone-300 bg-stone-50 text-stone-800 dark:border-stone-700 dark:bg-stone-950/40 dark:text-stone-200",
  },
  ACCOUNT_REGISTER: {
    badge:
      "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200",
    filter:
      "text-red-800 hover:bg-red-50 data-[pressed]:border-red-300 data-[pressed]:bg-red-50 dark:text-red-200 dark:hover:bg-red-950/40 dark:data-[pressed]:border-red-800 dark:data-[pressed]:bg-red-950/40",
    select:
      "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200",
  },
};

const fallbackTone: TransactionTypeTone = {
  badge: "border-border bg-muted text-foreground",
  filter:
    "text-muted-foreground hover:bg-muted data-[pressed]:bg-muted data-[pressed]:text-foreground",
  select: "border-border bg-muted text-foreground",
};

function toneFor(type: string | undefined) {
  return (type ? typeTones[type] : undefined) ?? fallbackTone;
}

/** Keeps a chain transaction filter visually paired with its table badge. */
export function transactionTypeFilterClass(type: string) {
  return toneFor(type).filter;
}

/** Gives OTX's compact select the same type colour language as the chip filters. */
export function transactionTypeSelectClass(type: string | undefined) {
  return type ? toneFor(type).select : undefined;
}

export function transactionTypeLabel(type: string): string {
  if (type === "mint") return "creation";
  return type.toLowerCase().replaceAll("_", " ");
}

/**
 * A transaction category, distinct from its outcome.
 *
 * The raw API enums are normalized for people while the full value remains
 * available through the accessible label.
 */
export function TransactionTypeBadge({
  type,
  kind,
  className,
}: {
  type: string;
  /** What the type describes, for the accessible label ("voucher transaction" …). */
  kind: string;
  className?: string;
}) {
  const label = transactionTypeLabel(type);

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono text-xs font-medium tracking-wide uppercase",
        toneFor(type).badge,
        className,
      )}
      aria-label={`${kind} type ${label}`}
    >
      {label}
    </Badge>
  );
}
