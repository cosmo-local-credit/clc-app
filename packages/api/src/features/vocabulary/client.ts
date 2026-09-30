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

/** `isCustom` is false for the values a deployment ships with. */
type VocabularyValue = { value: string; isCustom: boolean; total: number };

export type TagVocabulary = TagVocabularyUsage & VocabularyValue;
export type UnitVocabulary = UnitVocabularyUsage & VocabularyValue;
export type Vocabulary = {
  tags: TagVocabulary[];
  units: UnitVocabulary[];
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

    async getVocabulary(signal?: AbortSignal): Promise<Vocabulary> {
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
