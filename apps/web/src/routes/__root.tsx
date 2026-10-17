import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { DiscoveryLocationProvider } from "#/lib/discovery-location";
import { Trans, useLingui } from "@lingui/react/macro";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { privateKeyToAccount } from "viem/accounts";
import { useConnection } from "wagmi";
import { connect, disconnect } from "wagmi/actions";
import { Button } from "#/components/ui/button";
import { AppToaster } from "#/components/ui/toaster";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { clearPrivateKey, getStoredKey, storePrivateKey } from "#/connectors/privateKey";
import { BackendApiError, formatBackendApiError } from "@clc/api/client/errors";
import { clearIdentitySecrets } from "#/features/auth/api/identity-reset";
import { useBackendPrivateKeySignin } from "#/features/auth/hooks/use-backend-auth";
import { useIdentityTransitionTeardown } from "#/features/auth/hooks/use-identity-transition";
import { AppUpdateBanner } from "#/features/app-updates/ui/app-update-banner";
import { authSessionQueryKey, useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { whenNotificationIdentitySettled } from "#/features/notifications/recovery/identity-reset";
import { runNotificationRecovery } from "#/features/notifications/recovery/recovery";
import { initializeNotificationWorkerProtocol } from "#/features/notifications/sw/page-protocol";
import { initializeServiceWorkerUpdatePolicy } from "#/features/notifications/sw/update-policy";
import { beginWalletSwitch } from "#/lib/wallet-session";
import { useScanUrlImport } from "#/lib/scan-url-import";
import {
  clearWebAuthnCredential,
  getWebAuthnCredential,
  storeWebAuthnCredential,
} from "#/lib/webauthn-storage";
import {
  BRAND,
  BRAND_APP_NAME,
  BRAND_ICON_BASE,
  BRAND_MANIFEST_HREF,
  BRAND_THEME_COLOR,
} from "#/lib/brand";
import { AppI18nProvider } from "#/providers/i18n";
import { themeBootstrapScript } from "#/providers/theme";
import { Web3Provider } from "#/providers/web3";
import { pkConnector, wagmiConfig } from "#/providers/web3-config";
import { RouteError } from "#/components/route-error";
import { reloadOnceForStaleChunk } from "#/lib/stale-chunk-recovery";
import { useInstallPromptListener } from "#/features/install/install-store";
import { installBootstrapScript } from "#/features/install/install-bootstrap";
import { IntroductionProvider } from "#/components/introduction/introduction-provider";
import appCss from "../styles.css?url";

const AppDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("#/components/devtools").then((module) => ({
        default: module.AppDevtools,
      })),
    )
  : null;

const EncryptedPaperWalletImportForm = lazy(() =>
  import("#/components/encrypted-paper-wallet-import-form").then((module) => ({
    default: module.EncryptedPaperWalletImportForm,
  })),
);

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      // Android status bar and the Chrome toolbar. Rewritten by the theme
      // bootstrap script below to the dark variant when that scheme is active.
      { name: "theme-color", content: BRAND_THEME_COLOR.light },
      // iOS only honours the standalone hints from `apple-`-prefixed metas;
      // `mobile-web-app-capable` is the standardised name every other browser
      // reads. Both are required for a full-screen install.
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      // `default` keeps the iOS status bar legible over the app background.
      // `black-translucent` would slide the content under it, which this
      // top-to-bottom mobile layout does not account for.
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: BRAND_APP_NAME },
      { title: BRAND_APP_NAME },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: BRAND_MANIFEST_HREF },
      { rel: "icon", type: "image/svg+xml", href: `${BRAND_ICON_BASE}/logo.svg` },
      { rel: "icon", type: "image/x-icon", href: `${BRAND_ICON_BASE}/favicon.ico` },
      // iOS ignores the manifest icons and does not mask transparency, so this
      // one is full-bleed and opaque — a rounded tile here would be composited
      // on black before the home-screen squircle is applied.
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: `${BRAND_ICON_BASE}/apple-touch-icon.png`,
      },
    ],
  }),
  shellComponent: RootDocument,
  component: AppContent,
  errorComponent: RouteError,
});

function AppContent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <AppI18nProvider>
      <Web3Provider queryClient={queryClient}>
        <AppInner />
      </Web3Provider>
      <AppToaster />
    </AppI18nProvider>
  );
}

function AppInner() {
  useInstallPromptListener();
  const { t } = useLingui();
  const { address } = useConnection();
  const auth = useAuthStatus();
  const queryClient = useQueryClient();
  const backendSignin = useBackendPrivateKeySignin();
  const [switching, setSwitching] = useState(false);
  const { pendingKey, pendingEncryptedKey, queuePendingKey, clearPendingImport, clearPendingKey } =
    useScanUrlImport({ address, isSwitching: switching });
  const [switchError, setSwitchError] = useState<string | null>(null);

  const pendingAddress = useMemo(
    () => (pendingKey ? privateKeyToAccount(pendingKey).address : null),
    [pendingKey],
  );

  // Declared above the recovery effect below, which only orders the two effect
  // *bodies* — enough to arm the barrier the recovery pass then awaits, since
  // the teardown assigns it synchronously.
  useIdentityTransitionTeardown();

  useEffect(() => {
    if (import.meta.env.DEV) {
      return;
    }

    // Awaited, not merely declared second: the teardown empties the notification
    // stores and clears `syncCursor` asynchronously, and a concurrent recovery
    // pass would read that cursor before it is cleared, write it back, and
    // re-sync the outgoing user's messages into the store just emptied.
    void whenNotificationIdentitySettled().then(() =>
      runNotificationRecovery({
        currentWalletAddress: auth.isAuthenticated ? address : undefined,
        linkedWalletAddresses: auth.isAuthenticated && address ? [address] : undefined,
      }),
    );
  }, [address, auth.isAuthenticated]);

  async function handleConfirmSwitch() {
    if (!pendingKey) return;
    setSwitching(true);
    setSwitchError(null);
    const signal = beginWalletSwitch();
    const previousPrivateKey = getStoredKey();
    const previousWebAuthnCredential = getWebAuthnCredential();
    try {
      await backendSignin.mutateAsync({ privateKey: pendingKey });
      storePrivateKey(pendingKey);
      await connect(wagmiConfig, { connector: pkConnector });
      if (signal.aborted) {
        // Sign-out (or a newer switch) won, so no credential may survive — and
        // the clear goes *before* the await, for the same reason sign-out's
        // does. Sign-out already cleared once, but `storePrivateKey` above ran
        // after that, so the imported key is back on disk and only this path can
        // remove it. Sequenced after `await disconnect`, a throwing connector
        // would strand it on a device the UI shows as signed out.
        clearIdentitySecrets("none");
        try {
          // Undo this connect so the session does not silently switch to the
          // imported wallet after disconnect.
          await disconnect(wagmiConfig);
        } catch {
          // Credentials are already gone; a dead connector must not also leave
          // the pending import queued against a session that no longer exists.
        }
        clearPendingKey();
        return;
      }
      // Stays on the success edge, after the abort check: the catch below
      // restores `previousWebAuthnCredential`, so clearing any earlier — or in
      // the catch — would destroy the rollback.
      clearIdentitySecrets("private-key");
      await queryClient.invalidateQueries({ queryKey: authSessionQueryKey });
      clearPendingKey();
    } catch (err) {
      if (signal.aborted) {
        // Sign-out tore the session down, but it cleared before its own await
        // and `storePrivateKey` above ran after that — so reaching here via a
        // rejected `connect` leaves the imported key on disk unless this does
        // it. Deliberately not the rollback below: sign-out won, so the
        // previous credentials must not come back either.
        clearIdentitySecrets("none");
        return;
      }
      if (previousPrivateKey) {
        storePrivateKey(previousPrivateKey);
      } else {
        clearPrivateKey();
      }

      if (previousWebAuthnCredential) {
        storeWebAuthnCredential({
          credentialId: previousWebAuthnCredential.credentialId,
          keyHash: previousWebAuthnCredential.keyHash,
          publicKeyX: previousWebAuthnCredential.publicKeyX,
          publicKeyY: previousWebAuthnCredential.publicKeyY,
          address: previousWebAuthnCredential.address,
        });
      } else {
        clearWebAuthnCredential();
      }
      setSwitchError(
        err instanceof BackendApiError
          ? formatBackendApiError(err)
          : err instanceof Error
            ? err.message
            : t`Connection failed.`,
      );
    } finally {
      setSwitching(false);
    }
  }

  async function handleEncryptedUrlImport(key: `0x${string}`) {
    if (address) {
      queuePendingKey(key);
      return;
    }

    try {
      await backendSignin.mutateAsync({ privateKey: key });
      // This path had no credential clearing at all. It only runs with no wallet
      // connected, but a previous user's passkey can still be on disk: their
      // sign-out ran the private-key connector's disconnect, which clears
      // `clc_pk_*` and nothing else.
      clearIdentitySecrets("none");
      storePrivateKey(key);
      await connect(wagmiConfig, { connector: pkConnector });
      await queryClient.invalidateQueries({ queryKey: authSessionQueryKey });
      clearPendingImport();
    } catch (err) {
      clearPrivateKey();
      throw new Error(
        err instanceof BackendApiError
          ? formatBackendApiError(err)
          : err instanceof Error
            ? err.message
            : t`Connection failed.`,
      );
    }
  }

  return (
    <>
      {/* Above every shell, so it reaches pre-auth routes too. */}
      <AppUpdateBanner suppressed={Boolean(pendingKey || pendingEncryptedKey || switching)} />
      <IntroductionProvider suppressed={Boolean(pendingKey || pendingEncryptedKey || switching)}>
        <RootDiscoveryLocation>
          <Outlet />
        </RootDiscoveryLocation>
      </IntroductionProvider>
      {pendingEncryptedKey ? (
        <DialogRoot
          open={true}
          onOpenChange={(isOpen) => {
            if (!isOpen) clearPendingImport();
          }}
        >
          <DialogPortal>
            <DialogBackdrop />
            <DialogContent className="p-0">
              <DialogTitle className="sr-only">
                <Trans>Password-protected paper wallet</Trans>
              </DialogTitle>
              <Suspense fallback={null}>
                <EncryptedPaperWalletImportForm
                  encryptedKey={pendingEncryptedKey}
                  className="border-0 bg-transparent p-6"
                  onDecrypted={handleEncryptedUrlImport}
                  onCancel={clearPendingImport}
                />
              </Suspense>
            </DialogContent>
          </DialogPortal>
        </DialogRoot>
      ) : null}
      {pendingKey && pendingAddress ? (
        <DialogRoot
          open={true}
          onOpenChange={(isOpen) => {
            if (!isOpen) clearPendingKey();
          }}
        >
          <DialogPortal>
            <DialogBackdrop />
            <DialogContent>
              <DialogTitle>
                {address ? <Trans>Switch wallet?</Trans> : <Trans>Import paper wallet?</Trans>}
              </DialogTitle>
              <p className="text-muted-foreground mt-1 text-sm">
                {address ? (
                  <Trans>A paper wallet QR was scanned. Import this address?</Trans>
                ) : (
                  <Trans>A paper wallet link was opened. Sign in with this address?</Trans>
                )}
              </p>
              <p className="text-foreground mt-2 truncate font-mono text-xs">{pendingAddress}</p>
              <div className="mt-5 flex flex-col gap-2">
                <Button tap className="w-full" pending={switching} onClick={handleConfirmSwitch}>
                  {switching ? t`Connecting…` : address ? t`Switch wallet` : t`Import wallet`}
                </Button>
                <Button
                  variant="ghost"
                  tap
                  className="w-full"
                  onClick={clearPendingKey}
                  disabled={switching}
                >
                  <Trans>Cancel</Trans>
                </Button>
              </div>
              {switchError ? <p className="mt-3 text-destructive text-xs">{switchError}</p> : null}
            </DialogContent>
          </DialogPortal>
        </DialogRoot>
      ) : null}
    </>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  // Recover from stale code-split chunks after a deploy. React.lazy imports
  // don't get TanStack Router's built-in reload-on-module-missing (that lives in
  // lazyRouteComponent), so without this a failed chunk fetch leaves the tab
  // stuck on the error boundary. Independent of the service worker: browsers
  // with SW unsupported/disabled still hit version skew. See stale-chunk-recovery.
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const onPreloadError = (event: WindowEventMap["vite:preloadError"]) => {
      // Only swallow the error if we actually reload — otherwise let it throw so
      // the root errorComponent surfaces a persistent failure instead of a hang.
      if (reloadOnceForStaleChunk(event.payload)) {
        event.preventDefault();
      }
    };
    window.addEventListener("vite:preloadError", onPreloadError);
    return () => window.removeEventListener("vite:preloadError", onPreloadError);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    if (import.meta.env.DEV) {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .catch((err) => {
          console.error("[sw] unregister failed", err);
        });
      return;
    }

    let cancelled = false;
    let disposeNotificationProtocol: (() => void) | undefined;
    let disposeServiceWorkerUpdates: (() => void) | undefined;
    void (async () => {
      try {
        const { Serwist } = await import("@serwist/window");
        if (cancelled) return;
        const updatePolicy = await initializeServiceWorkerUpdatePolicy({
          createRegistrar: (scriptUrl, options) => new Serwist(scriptUrl, options),
        });
        if (cancelled) {
          updatePolicy.dispose();
          return;
        }
        disposeServiceWorkerUpdates = updatePolicy.dispose;
        if (cancelled) return;
        const protocol = await initializeNotificationWorkerProtocol();
        if (protocol.status === "ready") {
          if (cancelled) {
            protocol.dispose();
            return;
          }
          disposeNotificationProtocol = protocol.dispose;
        }
      } catch (err) {
        console.error("[sw] registration or coordination failed", err);
      }
    })();

    return () => {
      cancelled = true;
      disposeNotificationProtocol?.();
      disposeServiceWorkerUpdates?.();
    };
  }, []);

  return (
    <html lang="en" dir="ltr" data-brand={BRAND} suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: installBootstrapScript }} />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: synchronous pre-paint theme bootstrap, no user input */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        {children}
        {AppDevtools ? (
          <Suspense fallback={null}>
            <AppDevtools />
          </Suspense>
        ) : null}
        <Scripts />
      </body>
    </html>
  );
}

function RootDiscoveryLocation({ children }: { children: React.ReactNode }) {
  const owner = useStorageOwner();
  return (
    <DiscoveryLocationProvider owner={owner ?? "pending"}>{children}</DiscoveryLocationProvider>
  );
}
