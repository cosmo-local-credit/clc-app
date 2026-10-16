import { msg } from "@lingui/core/macro";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Croissant,
  QrCode,
  Store,
  Ticket,
  Wallet,
} from "lucide-react";

export const introductionSlides = [
  {
    title: msg({ id: "intro.wallet.title", message: "Your wallet" }),
    body: msg({
      id: "intro.wallet.body",
      message:
        "Your wallet holds your vouchers. Create an account and save your wallet access details to get started.",
    }),
    icons: [Wallet, Ticket, Check],
  },
  {
    title: msg({ id: "intro.voucher.title", message: "What is a voucher?" }),
    body: msg({
      id: "intro.voucher.body",
      message:
        "A voucher represents its issuer’s promise to provide goods or services. Check what it can be used for and who accepts it.",
    }),
    icons: [Store, Ticket, Croissant],
  },
  {
    title: msg({ id: "intro.offer.title", message: "What is an offer?" }),
    body: msg({
      id: "intro.offer.body",
      message:
        "An offer describes goods or services someone provides. Check the details, price, and which voucher is accepted.",
    }),
    icons: [Store, Croissant, Ticket],
  },
  {
    title: msg({ id: "intro.send.title", message: "Send a voucher" }),
    body: msg({
      id: "intro.send.body",
      message:
        "Choose a recipient, a voucher you hold, and the amount. Check the details before you confirm, then wait for the transfer result.",
    }),
    icons: [Wallet, ArrowUpRight, Store],
  },
  {
    title: msg({ id: "intro.receive.title", message: "Receive a voucher" }),
    body: msg({
      id: "intro.receive.body",
      message:
        "Open Receive and share your receiving QR code or wallet address with the sender. Keep your private wallet key to yourself.",
    }),
    icons: [QrCode, ArrowDownLeft, Wallet],
  },
];
