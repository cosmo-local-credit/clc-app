import { useEffect, useState } from "react";

export type PasskeyProvider = "apple" | "google";

/**
 * True on Google Chrome (Android and desktop) and mobile Apple devices
 * (iOS/iPadOS). These are the platforms where the provider-specific Google or
 * Apple labels accurately describe the stored passkey prompt.
 * All iOS browsers use the system WebAuthn implementation, so Chrome on iOS
 * must not be rejected by its CriOS user-agent marker. Chromium browsers with
 * a different password manager identity remain excluded from this
 * Google-labelled flow.
 */
export function isPasskeyPlatformAvailable(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iOS/iPadOS browsers all use Apple's system WebAuthn implementation.
  const isAppleMobile = /iPhone|iPad|iPod/.test(ua);
  // Chrome exposes Google Password Manager passkeys on Android, Windows,
  // macOS, Linux and ChromeOS. Exclude Chromium shells whose provider is not
  // accurately described by the Google label.
  const isChromePlatform = /Android|Windows NT|Macintosh|X11|CrOS/.test(ua);
  const isGoogleChrome =
    isChromePlatform &&
    /\bChrome\//.test(ua) &&
    !/SamsungBrowser|Edg(?:A|iOS)?\/|OPR\/|Opera|Vivaldi|YaBrowser/.test(ua);
  return isAppleMobile || isGoogleChrome;
}

export function pickPasskeyProvider(): PasskeyProvider {
  if (typeof navigator === "undefined") return "google";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "apple";
  return "google";
}

export function usePlatformPasskeyLabel(): {
  available: boolean;
  provider: PasskeyProvider;
  label: string;
} {
  const [available, setAvailable] = useState(false);
  const [provider, setProvider] = useState<PasskeyProvider>("google");

  useEffect(() => {
    setAvailable(isPasskeyPlatformAvailable());
    setProvider(pickPasskeyProvider());
  }, []);

  return {
    available,
    provider,
    label: provider === "apple" ? "Apple ID" : "Google",
  };
}
