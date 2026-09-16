/**
 * Name → ticker derivation for voucher symbols and pool shortcodes.
 *
 * The client derives candidates from the name the user typed, asks the catalog
 * which of them are already taken, and writes the first free one into the
 * symbol field. Everything here is deterministic and free of I/O so the same
 * name always yields the same candidate list on every platform.
 */

const SYMBOL_PREFIX_PATTERN = /^[A-Z0-9]{1,6}$/;
const SYMBOL_MAX_LENGTH = 6;
const STEM_LENGTH = 4;
const SUFFIX_BUDGET = 99;

/** Words that every voucher or pool name tends to carry and that add nothing to a ticker. */
const STOPWORDS = new Set([
  "VOUCHER",
  "POOL",
  "TOKEN",
  "CREDIT",
  "THE",
  "OF",
  "AND",
  "FOR",
  "A",
  "AN",
  "COMMUNITY",
]);

const VOWELS = new Set(["A", "E", "I", "O", "U"]);

/** Uppercases and trims; `null` unless the result is 1–6 characters of A–Z0–9. */
export function normalizeSymbolPrefix(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return SYMBOL_PREFIX_PATTERN.test(normalized) ? normalized : null;
}

function tokenize(name: string): string[] {
  const tokens = name
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 0);
  const kept = tokens.filter((token) => !STOPWORDS.has(token));
  // A voucher named only "Voucher" still has to produce a ticker.
  return kept.length > 0 ? kept : tokens;
}

/**
 * First character, then following consonants, then following vowels, until the
 * word is exhausted or `length` is reached. `KIVUKONI` → `KVK`, `SHOP` → `SHP`.
 */
function packWord(word: string, length: number): string {
  let out = word.slice(0, 1);
  for (const char of word.slice(1)) {
    if (out.length >= length) break;
    if (!VOWELS.has(char)) out += char;
  }
  if (out.length < length) {
    for (const char of word.slice(1)) {
      if (out.length >= length) break;
      if (VOWELS.has(char)) out += char;
    }
  }
  return out;
}

/**
 * The up-to-four-character stem a name derives: the first word packed to three
 * plus the initials of the following words, or the first word packed to four
 * when it stands alone. Empty when the name has no usable characters.
 */
export function symbolStemFromName(name: string): string {
  const tokens = tokenize(name);
  const [first, ...rest] = tokens;
  if (!first) return "";
  let stem = packWord(first, STEM_LENGTH - 1);
  for (const token of rest) {
    if (stem.length >= STEM_LENGTH) break;
    stem += token.slice(0, 1);
  }
  if (stem.length < STEM_LENGTH) stem = packWord(first, STEM_LENGTH);
  return stem.slice(0, STEM_LENGTH);
}

/**
 * The bare stem is issuance one, so a legal stem is followed by `stem2` …
 * `stem99`. A stem shorter than three characters fails the symbol schema on its
 * own and therefore starts at `stem1`. Empty when the name yields no stem.
 */
export function candidatesFromName(name: string): string[] {
  const stem = symbolStemFromName(name);
  if (!stem) return [];
  const candidates = stem.length >= 3 ? [stem] : [];
  const firstSuffix = candidates.length > 0 ? 2 : 1;
  for (let suffix = firstSuffix; suffix <= SUFFIX_BUDGET; suffix += 1) {
    const candidate = `${stem}${suffix}`;
    if (candidate.length <= SYMBOL_MAX_LENGTH) candidates.push(candidate);
  }
  return candidates;
}

/** The first candidate not in `taken`; both sides are already uppercased. */
export function pickAvailableSymbol(
  candidates: readonly string[],
  taken: ReadonlySet<string>,
): string | undefined {
  return candidates.find((candidate) => !taken.has(candidate));
}
