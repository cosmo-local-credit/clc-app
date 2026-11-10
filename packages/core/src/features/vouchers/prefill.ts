import { optionalTermsUrlSchema, optionalWebsiteSchema } from "../../lib/contact";
import { normalizeUnitOfAccount } from "../../lib/currencies";
import {
  buildPrefillHref,
  bySchema,
  createPrefillReader,
  definedFields,
  hasPrefillVersion,
  type ParsedPrefill,
  parsePrefillImageSource,
  parsePrefillTags,
  upperCased,
} from "../../lib/prefill";
import type { LocationInput } from "../location/logic";
import {
  type MarkerColor,
  type MarkerIcon,
  markerColorSchema,
  markerIconSchema,
} from "../markers/logic";
import {
  type VoucherUnit,
  voucherDescriptionSchema,
  voucherNameSchema,
  voucherPriceSchema,
  voucherSupplySchema,
  voucherSymbolSchema,
  voucherUnitSchema,
} from "./logic";

/** The step a voucher prefill lands on, and the only one that reads it. */
export const VOUCHER_PREFILL_PATH = "/vouchers/create/voucher";

/**
 * What a v1 link may seed into the voucher create form. Never the owner, the
 * terms acceptance, email or phone, or the fields the form fixes itself.
 * `iconSource` is a URL for storage-server to import, never an `iconUrl`.
 */
export type VoucherPrefill = {
  name?: string;
  symbol?: string;
  description?: string;
  price?: string;
  unitOfAccount?: VoucherUnit;
  supply?: string;
  location?: LocationInput;
  tags?: string[];
  website?: string;
  terms?: string;
  markerIcon?: MarkerIcon;
  markerColor?: MarkerColor;
  iconSource?: string;
};

/**
 * The step-1 route's validated search: each accepted param in its wire form.
 * String fields stay strings; only `v` and the coordinates may be numbers.
 */
export type VoucherPrefillSearch = Partial<
  Record<Exclude<keyof VoucherPrefill, "location"> | "locationName" | "country", string> &
    Record<"v" | "lat" | "lng", number | string>
>;

/** The voucher form fixes decimals at 6, so supply is checked against that. */
const supplySchema = voucherSupplySchema("6");

/**
 * Parses a voucher prefill off the router's parsed search, or null when the
 * link carries no `v=1`. Fields it does not accept are simply absent.
 */
export function parseVoucherPrefill(
  search: Record<string, unknown>,
): ParsedPrefill<VoucherPrefill, VoucherPrefillSearch> | null {
  if (!hasPrefillVersion(search)) return null;
  const read = createPrefillReader(search);
  const values = definedFields<VoucherPrefill>({
    name: read.text("name", bySchema(voucherNameSchema)),
    symbol: read.text("symbol", upperCased(bySchema(voucherSymbolSchema))),
    description: read.text("description", bySchema(voucherDescriptionSchema)),
    price: read.text("price", bySchema(voucherPriceSchema)),
    unitOfAccount: read.text("unitOfAccount", (value) =>
      bySchema(voucherUnitSchema)(normalizeUnitOfAccount(value)),
    ),
    supply: read.text("supply", bySchema(supplySchema)),
    location: read.location(),
    tags: read.text("tags", parsePrefillTags),
    website: read.text("website", bySchema(optionalWebsiteSchema)),
    terms: read.text("terms", bySchema(optionalTermsUrlSchema)),
    markerIcon: read.text("markerIcon", bySchema(markerIconSchema)),
    markerColor: read.text("markerColor", bySchema(markerColorSchema)),
    iconSource: read.text("iconSource", parsePrefillImageSource),
  });
  return { search: read.wire as VoucherPrefillSearch, values };
}

/**
 * The step-1 link for these fields, encoded the way the router reads it back.
 * Throws `PrefillTooLongError` over `PREFILL_URL_MAX_BYTES`.
 */
export function voucherPrefillHref(fields: VoucherPrefill): string {
  return buildPrefillHref(VOUCHER_PREFILL_PATH, fields);
}
