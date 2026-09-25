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

export type CustomTagVocabulary = TagVocabularyUsage & { value: string; total: number };
export type CustomUnitVocabulary = UnitVocabularyUsage & { value: string; total: number };
export type CustomVocabulary = {
  tags: CustomTagVocabulary[];
  units: CustomUnitVocabulary[];
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

    async getCustomVocabulary(signal?: AbortSignal): Promise<CustomVocabulary> {
      const result = await http.request<{ tags?: unknown; units?: unknown }>(
        "/api/v2/admin/vocabulary",
        { method: "GET", cache: "no-store", signal },
      );
      return {
        tags: normalizeRows(result.tags).map(normalizeTag),
        units: normalizeRows(result.units).map(normalizeUnit),
      };
    },

    async renameValue(kind: "tag" | "unit", value: string, replacement: string): Promise<void> {
      await http.request(`/api/v2/admin/vocabulary/${kind === "tag" ? "tags" : "units"}`, {
        method: "PUT",
        cache: "no-store",
        body: JSON.stringify({ value, replacement }),
      });
    },

    async deleteTag(value: string, signal?: AbortSignal): Promise<CustomTagVocabulary> {
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

    async deleteUnit(value: string, signal?: AbortSignal): Promise<CustomUnitVocabulary> {
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

function normalizeTag(row: BackendVocabularyRow): CustomTagVocabulary {
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
    ...usage,
    total: count(row.total) || Object.values(usage).reduce((sum, value) => sum + value, 0),
  };
}

function normalizeUnit(row: BackendVocabularyRow): CustomUnitVocabulary {
  const offerings = count(row.offerings);
  return {
    value: normalizeText(row.value) ?? "Unknown unit",
    offerings,
    total: count(row.total) || offerings,
  };
}
