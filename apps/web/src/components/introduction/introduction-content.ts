import { msg } from "@lingui/core/macro";

import type { GuideArtName } from "./guide-art";

type Slide = {
  title: ReturnType<typeof msg>;
  body: ReturnType<typeof msg>;
  art: GuideArtName;
  /** Ends the body with the About Cosmo-Local Credit link. */
  about?: boolean;
};

/**
 * The guide, in order: what CLC is, its three things (voucher, offer, pool),
 * the two everyday moves, then the wallet that Create account leads into.
 * Every message already exists in the catalogs; the welcome copy and the pool
 * explainer keep their source text so they reuse those translations.
 */
export const introductionSlides: readonly Slide[] = [
  {
    title: msg`Cosmo-Local Credit`,
    body: msg`Cosmo-Local Credit helps people and organizations support, share, and exchange goods and services.`,
    art: "network",
    about: true,
  },
  {
    title: msg({ id: "intro.voucher.title", message: "What is a voucher?" }),
    body: msg({
      id: "intro.voucher.body",
      message:
        "A voucher represents its issuer’s promise to provide goods or services. Check what it can be used for and who accepts it.",
    }),
    art: "voucher",
  },
  {
    title: msg({ id: "intro.offer.title", message: "What is an offer?" }),
    body: msg({
      id: "intro.offer.body",
      message:
        "An offer describes goods or services someone provides. Check the details, price, and which voucher is accepted.",
    }),
    art: "offer",
  },
  {
    title: msg`What's a pool?`,
    body: msg`A pool holds vouchers together so members can swap between them at a published value.`,
    art: "pool",
  },
  {
    title: msg({ id: "intro.send.title", message: "Send a voucher" }),
    body: msg({
      id: "intro.send.body",
      message:
        "Choose a recipient, a voucher you hold, and the amount. Check the details before you confirm, then wait for the transfer result.",
    }),
    art: "send",
  },
  {
    title: msg({ id: "intro.receive.title", message: "Receive a voucher" }),
    body: msg({
      id: "intro.receive.body",
      message:
        "Open Receive and share your receiving QR code or wallet address with the sender. Keep your private wallet key to yourself.",
    }),
    art: "receive",
  },
  {
    title: msg({ id: "intro.wallet.title", message: "Your wallet" }),
    body: msg({
      id: "intro.wallet.body",
      message:
        "Your wallet holds your vouchers. Create an account and save your wallet access details to get started.",
    }),
    art: "wallet",
  },
];
