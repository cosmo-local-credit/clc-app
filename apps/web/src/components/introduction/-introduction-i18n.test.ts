import { msg } from "@lingui/core/macro";
import { activateLocale, i18n } from "@clc/i18n/index";
import { LOCALE_OPTIONS } from "@clc/i18n/locales";
import { afterEach, expect, it } from "vite-plus/test";

const keys = [
  ...["wallet", "voucher", "offer", "send", "receive"].flatMap((slide) => [
    `intro.${slide}.title`,
    `intro.${slide}.body`,
  ]),
  "intro.replay",
];
afterEach(async () => activateLocale("en"));
it.each(LOCALE_OPTIONS)("loads complete introduction text in $code", async ({ code }) => {
  await activateLocale("en");
  const messages = [
    ...keys.map((id) => ({ id })),
    msg`What's a pool?`,
    msg`A pool holds vouchers together so members can swap between them at a published value.`,
  ];
  const english = messages.map((message) => i18n._(message));
  await activateLocale(code);
  messages.forEach((message, index) => {
    const key = message.id!;
    const text = i18n._(message);
    expect(text.trim()).not.toBe("");
    if (key.startsWith("intro.")) expect(text).not.toBe(key);
    if (code !== "en") expect(text, `${code}: ${key}`).not.toBe(english[index]);
  });
});
