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
import { RouteNotFound } from "#/components/route-not-found";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { clearPrivateKey, getStoredKey, storePrivateKey } from "#/connectors/privateKey";
import { BackendApiError, formatBackendApiError } from "#/features/auth/api/client";
import { useBackendPrivateKeySignin } from "#/features/auth/hooks/use-backend-auth";
import { authSessionQueryKey, useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { runNotificationRecovery } from "#/features/notifications/recovery/recovery";
import { initializeNotificationWorkerProtocol } from "#/features/notifications/sw/page-protocol";
import { initializeServiceWorkerUpdatePolicy } from "#/features/notifications/sw/update-policy";
import { abortWalletSwitch, beginWalletSwitch } from "#/lib/wallet-session";
import { useScanUrlImport } from "#/lib/scan-url-import";
import {
  clearWebAuthnCredential,
  getWebAuthnCredential,
  storeWebAuthnCredential,
} from "#/lib/webauthn-storage";
import { AppI18nProvider } from "#/providers/i18n";
import { themeBootstrapScript } from "#/providers/theme";
import { Web3Provider } from "#/providers/web3";
import { pkConnector, wagmiConfig } from "#/providers/web3-config";
import { RouteError } from "#/components/route-error";
import { reloadOnceForStaleChunk } from "#/lib/stale-chunk-recovery";
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
      { name: "theme-color", content: "#f2f2f2" },
      { title: "CLC App" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "icon", type: "image/svg+xml", href: "/logo.svg" },
      { rel: "icon", href: "/favicon.ico" },
      { rel: "apple-touch-icon", href: "/logo192.png" },
    ],
  }),
  shellComponent: RootDocument,
  component: AppContent,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
});

function AppContent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <AppI18nProvider>
      <Web3Provider queryClient={queryClient}>
        <AppInner />
      </Web3Provider>
    </AppI18nProvider>
  );
}

function AppInner() {
  const { t } = useLingui();
  const { address } = useConnection();
  const auth = useAuthStatus();
  const queryClient = useQueryClient();
  const backendSignin = useBackendPrivateKeySignin();
  const { pendingKey, pendingEncryptedKey, queuePendingKey, clearPendingImport, clearPendingKey } =
    useScanUrlImport();
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const pendingAddress = useMemo(
    () => (pendingKey ? privateKeyToAccount(pendingKey).address : null),
    [pendingKey],
  );

  // If the session is disconnected (sign-out) while a switch dialog is queued,
  // drop the pending import so the dialog doesn't linger or re-trigger after
  // disconnect. Skipped while a switch is actively in flight so a legitimate
  // account change (walletA -> walletB) isn't mistaken for a disconnect.
  useEffect(() => {
    if (!address && pendingKey && !switching) {
      abortWalletSwitch();
      clearPendingKey();
    }
  }, [address, pendingKey, switching, clearPendingKey]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      return;
    }

    void runNotificationRecovery({
      currentWalletAddress: auth.isAuthenticated ? address : undefined,
      linkedWalletAddresses: auth.isAuthenticated && address ? [address] : undefined,
    });
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
        // Sign-out (or a newer switch) won. Undo this connect so the session
        // does not silently switch to the imported wallet after disconnect.
        await disconnect(wagmiConfig);
        clearPendingKey();
        return;
      }
      clearWebAuthnCredential();
      await queryClient.invalidateQueries({ queryKey: authSessionQueryKey });
      clearPendingKey();
    } catch (err) {
      if (signal.aborted) return; // sign-out already tore the session down
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
      <Outlet />
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
              <DialogTitle className="text-base font-semibold">
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
                <Button className="h-11 w-full" disabled={switching} onClick={handleConfirmSwitch}>
                  {switching ? t`Connecting…` : address ? t`Switch wallet` : t`Import wallet`}
                </Button>
                <Button
                  variant="ghost"
                  className="h-11 w-full"
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
      {AppDevtools ? (
        <Suspense fallback={null}>
          <AppDevtools />
        </Suspense>
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: synchronous pre-paint theme bootstrap, no user input */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body suppressHydrationWarning>
        {children}
        <AppToaster />
        <Scripts />
      </body>
    </html>
  );
}
