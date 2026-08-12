/**
 * Whether this browser can actually present a CLC passkey.
 *
 * Two independent conditions, and both matter:
 *
 * 1. **A platform authenticator exists.** `isUserVerifyingPlatformAuthenticatorAvailable`
 *    is the standard capability check and the only authoritative one.
 * 2. **It is backed by the account manager that holds our passkeys.** CLC
 *    passkeys are created in Google Password Manager or in the Apple ID keychain,
 *    which in practice means desktop Chrome or Safari. Condition 1 is also true
 *    for Windows Hello in Edge and Firefox — those authenticators are real, but
 *    they hold no credential of ours, so offering the button there produces an
 *    empty picker and looks like a bug.
 *
 * Excluded deliberately: Edge (`Edg/`), Opera (`OPR/`) and Vivaldi are Chromium
 * but not Chrome, and do not use Google Password Manager. Firefox has no
 * cloud-synced platform passkey provider on desktop.
 *
 * User-agent sniffing is a poor tool and it is used here only for condition 2,
 * which has no feature-detectable equivalent — nothing in the WebAuthn API
 * reports *which* credential manager backs the authenticator. Condition 1 does
 * the real gating; getting condition 2 slightly wrong shows or hides a button,
 * never a wrong sign-in.
 *
 * apps/web has the mobile counterpart of this rule
 * (`isPasskeyPlatformAvailable`, Chrome Android and Safari iOS). The two are
 * separate on purpose: this console is desktop-only and that app is mobile-only,
 * so a single shared predicate would have to be wrong for one of them.
 */

import { useEffect, useState } from "react";

export type PasskeyProvider = "apple" | "google";

export type PasskeySupport =
  | { status: "checking" }
  | { status: "available"; provider: PasskeyProvider; label: string }
  | { status: "unsupported"; reason: string };

const CHROME_NOTE =
  "Passkey sign-in needs desktop Chrome (Google Password Manager) or Safari (Apple ID). " +
  "On any other browser, sign in with your paper wallet instead.";

/** Which account manager holds passkeys on this browser, if either does. */
export function detectPasskeyProvider(userAgent: string): PasskeyProvider | null {
  // Safari advertises `Safari/` and `Version/` and never `Chrome/`.
  const isSafari =
    /Safari\//.test(userAgent) &&
    /Version\//.test(userAgent) &&
    !/Chrome\/|Chromium\//.test(userAgent);
  if (isSafari) return "apple";

  const isChrome =
    /Chrome\//.test(userAgent) && !/Edg\/|OPR\/|Vivaldi|SamsungBrowser/.test(userAgent);
  if (isChrome) return "google";

  return null;
}

/**
 * The synchronous half of the check, kept pure and exported for tests.
 *
 * Returns the reason a passkey cannot be offered, or null when only the
 * asynchronous authenticator probe is left to run.
 */
export function passkeyBlockedReason(env: {
  hasWindow: boolean;
  isSecureContext: boolean;
  hasPublicKeyCredential: boolean;
  hasCredentialsGet: boolean;
  userAgent: string;
}): string | null {
  if (!env.hasWindow) return "Passkeys are only available in a browser.";
  if (!env.isSecureContext) {
    return "Passkeys require a secure context. Open this console over https:// or on localhost.";
  }
  if (!env.hasPublicKeyCredential || !env.hasCredentialsGet) {
    return `This browser does not support passkeys. ${CHROME_NOTE}`;
  }
  if (!detectPasskeyProvider(env.userAgent)) return CHROME_NOTE;

  return null;
}

/**
 * Resolves passkey support for the current browser.
 *
 * Starts as `checking` and never renders a passkey button optimistically: the
 * authenticator probe is asynchronous, and a button that disappears after mount
 * is worse than one that arrives a moment late.
 */
export function usePasskeySupport(): PasskeySupport {
  const [support, setSupport] = useState<PasskeySupport>({ status: "checking" });

  useEffect(() => {
    const blocked = passkeyBlockedReason({
      hasWindow: typeof window !== "undefined" && typeof navigator !== "undefined",
      isSecureContext: typeof window !== "undefined" && window.isSecureContext,
      hasPublicKeyCredential: typeof PublicKeyCredential !== "undefined",
      hasCredentialsGet: typeof navigator?.credentials?.get === "function",
      userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    });

    if (blocked) {
      setSupport({ status: "unsupported", reason: blocked });
      return;
    }

    const provider = detectPasskeyProvider(navigator.userAgent);
    let active = true;

    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then((hasAuthenticator) => {
        if (!active) return;
        setSupport(
          hasAuthenticator && provider
            ? {
                status: "available",
                provider,
                label: provider === "apple" ? "Apple ID" : "Google",
              }
            : {
                status: "unsupported",
                reason: `No passkey is available on this device. ${CHROME_NOTE}`,
              },
        );
      })
      .catch(() => {
        if (!active) return;
        setSupport({
          status: "unsupported",
          reason: `This browser could not report passkey support. ${CHROME_NOTE}`,
        });
      });

    return () => {
      active = false;
    };
  }, []);

  return support;
}
