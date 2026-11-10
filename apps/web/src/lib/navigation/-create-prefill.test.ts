import { parsePoolPrefill, poolPrefillHref } from "@clc/core/features/pools/prefill";
import {
  parseVoucherPrefill,
  type VoucherPrefill,
  voucherPrefillHref,
} from "@clc/core/features/vouchers/prefill";
import { PREFILL_URL_MAX_BYTES, PrefillTooLongError, utf8ByteLength } from "@clc/core/lib/prefill";
import { defaultParseSearch, defaultStringifySearch } from "@tanstack/react-router";
import { describe, expect, it } from "vite-plus/test";

import { parseOnboardingSearch, onboardingSearch } from "#/lib/onboarding-search";
import { isWithinLinkBudget, returnDestination } from "./return-destination";

/** How the router splits a link it is handed: path, then its own re-stringified search. */
function arrive(href: string) {
  const url = new URL(href, "https://app.test");
  const search = defaultParseSearch(url.search) as Record<string, unknown>;
  return {
    pathname: url.pathname,
    search,
    searchStr: defaultStringifySearch(search),
    hash: url.hash.slice(1),
  };
}

/** The onboarding URL a signed-out person is sent to, as the router would write it. */
function onboardingHref(location: ReturnType<typeof arrive>) {
  return `/onboarding${defaultStringifySearch(onboardingSearch("welcome", returnDestination(location)))}`;
}

const CLC_EDGE_URL_LIMIT = 16 * 1024;

describe("voucherPrefillHref through the router's parser", () => {
  it("gives back every value exactly", () => {
    const fields = {
      name: "123",
      symbol: "TRUE",
      description: "null",
      price: "1.50",
      supply: "9007199254740993.000001",
      unitOfAccount: '"KES"',
      website: "https://example.org/a?b=1&c=2",
      tags: ["Mboga", "Matunda Safi"] as string[],
      location: { locationName: "Ngong' Road, Nairobi", lat: -1.3133, lng: 36.7876, country: "KE" },
    } satisfies VoucherPrefill;
    const href = voucherPrefillHref({
      ...fields,
      name: "Mama Mboga 123",
      description: "Maharage, sukuma na mchicha — 🥬 Кибера 基贝拉",
    });

    const { search } = arrive(href);
    expect(search.v).toBe(1);
    expect(search.lat).toBe(-1.3133);
    expect(search.lng).toBe(36.7876);
    expect(search.price).toBe("1.50");
    expect(search.supply).toBe("9007199254740993.000001");

    const parsed = parseVoucherPrefill(search);
    expect(parsed?.values).toEqual({
      name: "Mama Mboga 123",
      symbol: "TRUE",
      description: "Maharage, sukuma na mchicha — 🥬 Кибера 基贝拉",
      price: "1.50",
      supply: "9007199254740993.000001",
      unitOfAccount: '"kes"',
      website: "https://example.org/a?b=1&c=2",
      tags: ["Mboga", "Matunda Safi"],
      location: fields.location,
    });
  });

  it("keeps true-, null- and number-looking text as strings", () => {
    for (const name of ["true", "null", "12345", "[1,2]", '{"a":1}', '"quoted"']) {
      const { search } = arrive(voucherPrefillHref({ description: `${name}` }));
      expect(search.description).toBe(name);
    }
  });

  it("is unchanged by the router's rewrite, so a reload sees the same link", () => {
    const href = voucherPrefillHref({ name: "Mama Mboga", price: "50", supply: "1000" });
    const { pathname, searchStr, search } = arrive(href);
    const validated = parseVoucherPrefill(search)?.search ?? {};

    expect(`${pathname}${defaultStringifySearch({ ...search, ...validated })}`).toBe(href);
    expect(`${pathname}${searchStr}`).toBe(href);
  });
});

describe("poolPrefillHref through the router's parser", () => {
  it("returns feesDecoupled as a boolean the schema accepts", () => {
    const { search } = arrive(
      poolPrefillHref({ name: "Kibera Growers", feePolicyDefault: "2", feesDecoupled: true }),
    );

    expect(search.feesDecoupled).toBe(true);
    expect(parsePoolPrefill(search)?.values).toEqual({
      name: "Kibera Growers",
      feePolicyDefault: "2",
      feesDecoupled: true,
    });
  });

  it("takes feesDecoupled quoted, and drops it otherwise", () => {
    expect(
      parsePoolPrefill(arrive("/pools/create/pool?v=1&feesDecoupled=%22true%22").search)?.values,
    ).toEqual({ feesDecoupled: true });
    expect(
      parsePoolPrefill(arrive("/pools/create/pool?v=1&feesDecoupled=yes").search)?.values,
    ).toEqual({});
    expect(parsePoolPrefill(arrive("/pools/create/pool?v=%221%22&name=Abc+Pool").search)).not.toBe(
      null,
    );
  });
});

describe("the link budget", () => {
  const UNIT = "基,&="; // 9 + 3 + 3 + 3 encoded bytes
  const fits = (fields: VoucherPrefill, bytes: number) => {
    try {
      return utf8ByteLength(voucherPrefillHref(fields)) <= bytes;
    } catch {
      return false;
    }
  };

  /**
   * Three-byte characters and delimiters in every long field, the terms URL
   * topped up byte by byte to land on exactly `bytes`.
   */
  function worstCaseLink(bytes: number) {
    const fields: VoucherPrefill = {
      name: "基".repeat(80),
      description: UNIT.repeat(125),
      terms: "https://example.org/",
    };
    while (fits({ ...fields, terms: `${fields.terms}${UNIT}` }, bytes)) fields.terms += UNIT;
    while (fits({ ...fields, terms: `${fields.terms}a` }, bytes)) fields.terms += "a";
    return { fields, href: voucherPrefillHref(fields) };
  }

  it("keeps a link at the limit under the edge's URL limit once nested in the redirect, and returns the same prefill", () => {
    const { href } = worstCaseLink(PREFILL_URL_MAX_BYTES);
    expect(utf8ByteLength(href)).toBe(PREFILL_URL_MAX_BYTES);
    const location = arrive(href);
    expect(isWithinLinkBudget(location)).toBe(true);
    const applied = parseVoucherPrefill(location.search)?.values;
    expect(Object.keys(applied ?? {}).sort()).toEqual(["description", "name", "terms"]);

    const onboarding = onboardingHref(location);
    expect(utf8ByteLength(`https://test.cosmolocal.credit${onboarding}`)).toBeLessThan(
      CLC_EDGE_URL_LIMIT,
    );

    // After sign-in: onboarding hands the redirect back, and the router reads it again.
    const redirect = parseOnboardingSearch(arrive(onboarding).search).redirect;
    expect(redirect).toBe(href);
    expect(parseVoucherPrefill(arrive(redirect as string).search)?.values).toEqual(applied);
  });

  it("refuses one byte over: the builder throws and an arriving link is ignored", () => {
    const { fields, href } = worstCaseLink(PREFILL_URL_MAX_BYTES);
    expect(() => voucherPrefillHref({ ...fields, terms: `${fields.terms}a` })).toThrow(
      PrefillTooLongError,
    );

    expect(isWithinLinkBudget(arrive(`${href}a`))).toBe(false);
  });

  it.each([
    ["an unread param", "padding"],
    ["a rejected field", "price"],
  ])(
    "ignores a short prefill carrying %s of 6 KB, and redirects with the pathname alone",
    (_, key) => {
      const href = `${voucherPrefillHref({ name: "Mama Mboga" })}&${key}=${"x".repeat(6 * 1024)}`;
      const location = arrive(href);

      expect(parseVoucherPrefill(location.search)?.values.name).toBe("Mama Mboga");
      expect(isWithinLinkBudget(location)).toBe(false);
      expect(returnDestination(location)).toBe("/vouchers/create/voucher");
      expect(utf8ByteLength(onboardingHref(location))).toBeLessThan(CLC_EDGE_URL_LIMIT);
    },
  );

  it("gives any route an oversized query a pathname-only redirect", () => {
    const location = arrive(`/wallet/send?to=${"a".repeat(5000)}#section`);

    expect(returnDestination(location)).toBe("/wallet/send");
  });

  it("returns the whole URL, hash included, when it fits", () => {
    expect(returnDestination(arrive("/pools/abc?tab=vouchers#top"))).toBe(
      "/pools/abc?tab=vouchers#top",
    );
  });
});
