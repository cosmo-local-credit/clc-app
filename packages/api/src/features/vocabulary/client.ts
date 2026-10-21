import type { HttpClient } from "../../client/http-client";
import { normalizeNumber, normalizeText } from "../../lib/api-normalize";

type TagVocabularyUsage = {
  deployedTokens: number;
  deployedPools: number;
  vouchers: number;
  pools: number;
  posts: number;
  offerings: number;
};

type UnitVocabularyUsage = { offerings: number };
type UnitOfAccountVocabularyUsage = {
  profiles: number;
  vouchers: number;
  pools: number;
  voucherDeployments: number;
  poolDeployments: number;
};

/** `isCustom` is false for the values a deployment ships with. */
type VocabularyValue = { value: string; isCustom: boolean; total: number };

export type TagVocabulary = TagVocabularyUsage & VocabularyValue;
export type UnitVocabulary = UnitVocabularyUsage & VocabularyValue;
export type UnitOfAccountVocabulary = UnitOfAccountVocabularyUsage & VocabularyValue;
export type Vocabulary = {
  tags: TagVocabulary[];
  units: UnitVocabulary[];
  unitsOfAccount: UnitOfAccountVocabulary[];
};

type BackendVocabularyRow = Record<string, unknown> & { value?: unknown };

export type VocabularyClient = ReturnType<typeof createVocabularyClient>;

export function createVocabularyClient(http: HttpClient) {
  return {
    async getOfferingUnits(signal?: AbortSignal): Promise<string[]> {
      const result = await http.request<{ units?: unknown }>("/api/v2/offering-units", {
        method: "GET",
        cache: "no-store",
        signal,
      });
      return normalizeValues(result.units);
    },

    async getUnitsOfAccount(signal?: AbortSignal): Promise<UnitOfAccountVocabulary[]> {
      const result = await http.request<{ unitsOfAccount?: unknown }>("/api/v2/units-of-account", {
        method: "GET",
        cache: "no-store",
        signal,
      });
      return normalizeRows(result.unitsOfAccount).map(normalizeUnitOfAccount);
    },

    async getVocabulary(signal?: AbortSignal): Promise<Vocabulary> {
      const result = await http.request<{
        tags?: unknown;
        units?: unknown;
        unitsOfAccount?: unknown;
      }>("/api/v2/admin/vocabulary", { method: "GET", cache: "no-store", signal });
      return {
        tags: normalizeRows(result.tags).map(normalizeTag),
        units: normalizeRows(result.units).map(normalizeUnit),
        unitsOfAccount: normalizeRows(result.unitsOfAccount).map(normalizeUnitOfAccount),
      };
    },

    async createUnitOfAccount(value: string): Promise<string> {
      const result = await http.request<{ value?: unknown }>(
        "/api/v2/admin/vocabulary/units-of-account",
        {
          method: "POST",
          cache: "no-store",
          body: JSON.stringify({ value }),
        },
      );
      return normalizeText(result.value) ?? value;
    },

    async renameValue(kind: "tag" | "unit", value: string, replacement: string): Promise<void> {
      await http.request(`/api/v2/admin/vocabulary/${kind === "tag" ? "tags" : "units"}`, {
        method: "PUT",
        cache: "no-store",
        body: JSON.stringify({ value, replacement }),
      });
    },

    async deleteTag(value: string, signal?: AbortSignal): Promise<TagVocabulary> {
      const result = await http.request<{
        value?: unknown;
        usage?: BackendVocabularyRow;
        total?: unknown;
      }>("/api/v2/admin/vocabulary/tags", {
        method: "DELETE",
        cache: "no-store",
        signal,
        body: JSON.stringify({ value }),
      });
      return normalizeTag({ value: result.value, ...result.usage, total: result.total });
    },

    async deleteUnit(value: string, signal?: AbortSignal): Promise<UnitVocabulary> {
      const result = await http.request<{
        value?: unknown;
        usage?: BackendVocabularyRow;
        total?: unknown;
      }>("/api/v2/admin/vocabulary/units", {
        method: "DELETE",
        cache: "no-store",
        signal,
        body: JSON.stringify({ value }),
      });
      return normalizeUnit({ value: result.value, ...result.usage, total: result.total });
    },

    async renameUnitOfAccount(value: string, replacement: string): Promise<void> {
      await http.request("/api/v2/admin/vocabulary/units-of-account", {
        method: "PUT",
        cache: "no-store",
        body: JSON.stringify({ value, replacement }),
      });
    },

    async deleteUnitOfAccount(
      value: string,
      signal?: AbortSignal,
    ): Promise<UnitOfAccountVocabulary> {
      const result = await http.request<{
        value?: unknown;
        usage?: BackendVocabularyRow;
        total?: unknown;
      }>("/api/v2/admin/vocabulary/units-of-account", {
        method: "DELETE",
        cache: "no-store",
        signal,
        body: JSON.stringify({ value }),
      });
      return normalizeUnitOfAccount({ value: result.value, ...result.usage, total: result.total });
    },
  };
}

function normalizeValues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeText).filter((entry): entry is string => Boolean(entry));
}

function normalizeRows(value: unknown): BackendVocabularyRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is BackendVocabularyRow => typeof entry === "object" && entry !== null,
  );
}

function count(value: unknown): number {
  return normalizeNumber(value) ?? 0;
}

// Only a value the backend marks built-in is one: a deleted value is custom by
// definition, and so is every row from a backend that listed custom values only.
function isCustom(row: BackendVocabularyRow): boolean {
  return row.isCustom !== false;
}

function normalizeTag(row: BackendVocabularyRow): TagVocabulary {
  const usage = {
    deployedTokens: count(row.deployedTokens),
    deployedPools: count(row.deployedPools),
    vouchers: count(row.vouchers),
    pools: count(row.pools),
    posts: count(row.posts),
    offerings: count(row.offerings),
  };
  return {
    value: normalizeText(row.value) ?? "Unknown tag",
    isCustom: isCustom(row),
    ...usage,
    total: count(row.total) || Object.values(usage).reduce((sum, value) => sum + value, 0),
  };
}

function normalizeUnit(row: BackendVocabularyRow): UnitVocabulary {
  const offerings = count(row.offerings);
  return {
    value: normalizeText(row.value) ?? "Unknown unit",
    isCustom: isCustom(row),
    offerings,
    total: count(row.total) || offerings,
  };
}

function normalizeUnitOfAccount(row: BackendVocabularyRow): UnitOfAccountVocabulary {
  const usage = {
    profiles: count(row.profiles),
    vouchers: count(row.vouchers),
    pools: count(row.pools),
    voucherDeployments: count(row.voucherDeployments),
    poolDeployments: count(row.poolDeployments),
  };
  return {
    value: normalizeText(row.value) ?? "Unknown unit of account",
    isCustom: isCustom(row),
    ...usage,
    total: count(row.total) || Object.values(usage).reduce((sum, value) => sum + value, 0),
  };
}
