import { activateLocale, i18n } from "@clc/i18n/index";
import { LOCALE_OPTIONS } from "@clc/i18n/locales";
import { msg } from "@lingui/core/macro";
import { afterEach, expect, it } from "vite-plus/test";

const balanceMessage = msg`Other accounts hold <0>{amount} {symbol}</0> of your voucher.`;
const poolMessage = msg`{count, plural, one {Your pool holds # known voucher type with a positive balance.} other {Your pool holds # known voucher types with positive balances.}}`;
const permanenceMessage = msg`Retirement does not delete the voucher or pool from the blockchain. Existing balances and transaction history remain.`;

afterEach(async () => activateLocale("en"));

it.each(LOCALE_OPTIONS)(
  "loads retirement warnings and preserves balances in $code",
  async ({ code }) => {
    await activateLocale("en");
    const english = i18n._(permanenceMessage);
    await activateLocale(code);

    const permanence = i18n._(permanenceMessage);
    expect(permanence.trim()).not.toBe("");
    expect(permanence).not.toBe(permanenceMessage.id);
    // Dzongkha has an explicit English fallback until a fluent review is available.
    if (code !== "en" && code !== "dz") expect(permanence).not.toBe(english);

    const balance = i18n._({ ...balanceMessage, values: { amount: "0.000001", symbol: "CARE" } });
    expect(balance).toContain("<0>0.000001 CARE</0>");
    expect(balance).not.toContain("{amount}");

    for (const count of [0, 1, 2, 5, 21]) {
      const pool = i18n._({ ...poolMessage, values: { count } });
      expect(pool.trim()).not.toBe("");
      expect(pool).not.toBe(poolMessage.id);
      expect(pool).not.toContain("{count");
      expect(pool).not.toContain("#");
      if (count === 5) expect(pool).toContain(i18n.number(count));
    }
  },
);
