import { isHttpUrl } from "@clc/core/lib/contact";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  RiCoinLine,
  RiGlobalLine,
  RiHandCoinLine,
  RiNavigationLine,
  RiPhoneLine,
  RiSendPlane2Line,
} from "react-icons/ri";
import { isAddress, zeroAddress } from "viem";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { openDefaultMaps } from "#/lib/default-maps";
import { cn } from "#/lib/utils";

const CELL =
  "flex min-w-0 flex-col items-center justify-center gap-1 border-border border-e px-1 font-medium last:border-e-0 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground";
const LIVE = "hover:bg-muted";
const DEAD = "cursor-not-allowed text-muted-foreground/60";

/**
 * `.acts6`: Get, Send, Redeem, Directions, Call and Website in six equal cells
 * under the summary. Each runs the phone's handler under the phone's rules; a
 * cell the viewer cannot use (no balance, no owner, signed out, no contact)
 * stays in its place, disabled, so the strip never reflows.
 */
export function VoucherActionCells({
  address,
  name,
  ownerAddress,
  hasPositiveBalance,
  locationName,
  lat,
  lng,
  phone,
  website,
  size = "page",
}: {
  address: string;
  name: string;
  ownerAddress?: string | null;
  hasPositiveBalance: boolean;
  locationName?: string | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  website?: string | null;
  /** The page's cells are 58px; the place panel's 56px with 16px icons. */
  size?: "page" | "panel";
}) {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const coordinates = typeof lat === "number" && typeof lng === "number";
  const owner =
    ownerAddress &&
    isAddress(ownerAddress, { strict: false }) &&
    ownerAddress.toLowerCase() !== zeroAddress
      ? ownerAddress
      : null;
  const verifiedWebsite = website && isHttpUrl(website) ? website : null;
  const cell = cn(CELL, size === "page" ? "py-2.5 text-xs" : "py-2.5 text-2xs");
  const icon = size === "page" ? "size-[18px]" : "size-4";

  const off = (key: string, glyph: ReactNode, label: ReactNode) => (
    <span key={key} aria-disabled="true" className={cn(cell, DEAD)}>
      {glyph}
      {label}
    </span>
  );

  const get = (
    <Link
      key="get"
      to="/market"
      search={{ scope: "pools", out_voucher: address.toLowerCase() }}
      className={cn(cell, LIVE)}
    >
      <RiHandCoinLine className={icon} aria-hidden="true" />
      <Trans>Get</Trans>
    </Link>
  );
  const sendIcon = <RiSendPlane2Line className={icon} aria-hidden="true" />;
  const send = hasPositiveBalance ? (
    <Link key="send" to="/wallet/send" search={{ token: address }} className={cn(cell, LIVE)}>
      {sendIcon}
      <Trans>Send</Trans>
    </Link>
  ) : (
    off("send", sendIcon, <Trans>Send</Trans>)
  );
  const redeemIcon = <RiCoinLine className={icon} aria-hidden="true" />;
  const redeem =
    hasPositiveBalance && owner ? (
      <Link
        key="redeem"
        to="/wallet/send/amount"
        search={{ token: address, recipient: owner }}
        className={cn(cell, LIVE)}
      >
        {redeemIcon}
        <Trans>Redeem</Trans>
      </Link>
    ) : (
      off("redeem", redeemIcon, <Trans>Redeem</Trans>)
    );
  const directionsIcon = <RiNavigationLine className={icon} aria-hidden="true" />;
  const directions =
    auth.isAuthenticated && (coordinates || locationName) ? (
      <button
        key="directions"
        type="button"
        className={cn(cell, LIVE)}
        onClick={() => openDefaultMaps({ label: locationName ?? name, lat, lng })}
      >
        {directionsIcon}
        <Trans>Directions</Trans>
      </button>
    ) : (
      off("directions", directionsIcon, <Trans>Directions</Trans>)
    );
  const callIcon = <RiPhoneLine className={icon} aria-hidden="true" />;
  const call =
    auth.isAuthenticated && phone ? (
      <a key="call" href={`tel:${phone}`} className={cn(cell, LIVE)}>
        {callIcon}
        <Trans>Call</Trans>
      </a>
    ) : (
      off("call", callIcon, <Trans>Call</Trans>)
    );
  const websiteIcon = <RiGlobalLine className={icon} aria-hidden="true" />;
  const site =
    auth.isAuthenticated && verifiedWebsite ? (
      <a
        key="website"
        href={verifiedWebsite}
        target="_blank"
        rel="noreferrer noopener"
        className={cn(cell, LIVE)}
      >
        {websiteIcon}
        <Trans>Website</Trans>
      </a>
    ) : (
      off("website", websiteIcon, <Trans>Website</Trans>)
    );

  return (
    <div
      role="group"
      aria-label={t`Voucher actions`}
      className="grid grid-cols-6 border border-border bg-card"
    >
      {get}
      {send}
      {redeem}
      {directions}
      {call}
      {site}
    </div>
  );
}
