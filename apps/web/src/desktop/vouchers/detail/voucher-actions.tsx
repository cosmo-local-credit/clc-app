import { isHttpUrl } from "@clc/core/lib/contact";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useId, useState, type ReactNode } from "react";
import {
  RiCoinLine,
  RiGlobalLine,
  RiHandCoinLine,
  RiNavigationLine,
  RiPhoneLine,
  RiSendPlane2Line,
} from "react-icons/ri";
import { isAddress, zeroAddress } from "viem";

import { sanitizeInternalRedirect } from "#/components/auth/redirect";
import { deskSectionLinkClass } from "#/desktop/ui/page";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { openDefaultMaps } from "#/lib/default-maps";
import { onboardingSearch } from "#/lib/onboarding-search";
import { cn } from "#/lib/utils";

const CELL =
  "flex min-w-0 flex-col items-center justify-center gap-1 border-border border-e px-1 text-center leading-tight font-medium [overflow-wrap:anywhere] last:border-e-0 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground";
const LIVE = "hover:bg-muted";
const DEAD = "cursor-not-allowed text-muted-foreground";

type ActionKey = "send" | "redeem" | "directions" | "call" | "website";
type BalanceStatus = "hidden" | "loading" | "unavailable" | "ready";

/**
 * `.acts6`: Get, Send, Redeem, Directions, Call and Website in six equal cells
 * under the summary. Each runs the phone's handler under the phone's rules.
 * A cell the viewer cannot use stays in its place so the strip never reflows,
 * but it is a focusable, aria-disabled button that says why: hover or focus
 * shows the reason under the strip, and a screen reader gets it as the
 * button's description. When signing in is what is missing, the line under the
 * strip carries a Sign in link.
 */
export function VoucherActionCells({
  address,
  name,
  ownerAddress,
  hasPositiveBalance,
  balanceStatus,
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
  /** Tells "no balance" from a balance that is still loading or failed to load. */
  balanceStatus?: BalanceStatus;
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
  const baseId = useId();
  const [shown, setShown] = useState<ActionKey | null>(null);
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
  const signedOut = !auth.isAuthenticated && !auth.isLoading;
  const checking = auth.isLoading;

  const reasons: Partial<Record<ActionKey, string>> = {};
  const off = (key: ActionKey, glyph: ReactNode, label: ReactNode, reason: string) => {
    reasons[key] = reason;
    return (
      <button
        key={key}
        type="button"
        aria-disabled="true"
        aria-describedby={`${baseId}-${key}`}
        className={cn(cell, DEAD)}
        onClick={(event) => event.preventDefault()}
        onMouseEnter={() => setShown(key)}
        onMouseLeave={() => setShown((current) => (current === key ? null : current))}
        onFocus={() => setShown(key)}
        onBlur={() => setShown((current) => (current === key ? null : current))}
      >
        {glyph}
        {label}
      </button>
    );
  };

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

  const balanceReason = (signIn: string) =>
    checking
      ? t`Checking your session…`
      : signedOut
        ? signIn
        : balanceStatus === "loading"
          ? t`Checking balance…`
          : balanceStatus === "unavailable"
            ? t`Balance unavailable`
            : t`No balance`;

  const sendIcon = <RiSendPlane2Line className={icon} aria-hidden="true" />;
  const send = hasPositiveBalance ? (
    <Link key="send" to="/wallet/send" search={{ token: address }} className={cn(cell, LIVE)}>
      {sendIcon}
      <Trans>Send</Trans>
    </Link>
  ) : (
    off("send", sendIcon, <Trans>Send</Trans>, balanceReason(t`Sign in to send`))
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
      off(
        "redeem",
        redeemIcon,
        <Trans>Redeem</Trans>,
        hasPositiveBalance ? t`No issuer listed` : balanceReason(t`Sign in to redeem`),
      )
    );

  const contactReason = (signIn: string, missing: string) =>
    checking ? t`Checking your session…` : signedOut ? signIn : missing;

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
      off(
        "directions",
        directionsIcon,
        <Trans>Directions</Trans>,
        contactReason(t`Sign in for directions`, t`No location listed`),
      )
    );
  const callIcon = <RiPhoneLine className={icon} aria-hidden="true" />;
  const call =
    auth.isAuthenticated && phone ? (
      <a key="call" href={`tel:${phone}`} className={cn(cell, LIVE)}>
        {callIcon}
        <Trans>Call</Trans>
      </a>
    ) : (
      off(
        "call",
        callIcon,
        <Trans>Call</Trans>,
        contactReason(t`Sign in to call`, t`No phone listed`),
      )
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
      off(
        "website",
        websiteIcon,
        <Trans>Website</Trans>,
        contactReason(t`Sign in to open the website`, t`No website listed`),
      )
    );

  const unavailable = Object.keys(reasons) as ActionKey[];
  const redirectTo = sanitizeInternalRedirect(
    typeof window === "undefined"
      ? undefined
      : `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );

  return (
    <div className="grid gap-1.5">
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
      {unavailable.length > 0 ? (
        // One line, always the same height, so a reason appearing never moves
        // what is below. The text repeats what each disabled cell already
        // describes to a screen reader, so it is hidden from them here.
        <div className="flex min-h-5 min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
          <span aria-hidden="true" className="min-w-0 [overflow-wrap:anywhere]">
            {shown ? reasons[shown] : null}
          </span>
          {signedOut ? (
            <Link
              to="/onboarding"
              search={onboardingSearch("signin", redirectTo)}
              replace
              className={cn(deskSectionLinkClass(), "ms-auto shrink-0")}
            >
              <Trans>Sign in</Trans>
            </Link>
          ) : null}
          {unavailable.map((key) => (
            <span key={key} id={`${baseId}-${key}`} className="sr-only">
              {reasons[key]}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
