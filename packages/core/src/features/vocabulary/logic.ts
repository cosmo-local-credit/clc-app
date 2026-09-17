/** Shared validation and display rules for user-created vocabulary values. */
const CUSTOM_TAG_MAX_LENGTH = 100;
export const CUSTOM_UNIT_MAX_LENGTH = 32;

/**
 * Trims and collapses whitespace, then capitalizes every whitespace-delimited
 * word. The backend repeats this rule and remains the canonical authority.
 */
export function toVocabularyTitleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((word) => {
      const points = Array.from(word.toLowerCase());
      if (points.length === 0) return "";
      return `${points[0]?.toUpperCase() ?? ""}${points.slice(1).join("")}`;
    })
    .join(" ");
}

export function validateCustomTag(value: string): string | null {
  const normalized = toVocabularyTitleCase(value);
  if (!normalized) return "Enter a tag";
  if (Array.from(normalized).length > CUSTOM_TAG_MAX_LENGTH) {
    return "Tags must be 100 characters or fewer";
  }
  if (normalized.includes(",")) return "Tags must not contain commas";
  return null;
}

export function validateCustomUnit(value: string): string | null {
  const normalized = toVocabularyTitleCase(value);
  if (!normalized) return "Enter a unit";
  if (Array.from(normalized).length > CUSTOM_UNIT_MAX_LENGTH) {
    return "Unit must be 32 characters or fewer";
  }
  return null;
}
