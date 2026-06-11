import { Trans, useLingui } from "@lingui/react/macro";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Toaster } from "sonner";
import { privateKeyToAccount } from "viem/accounts";
import { connect } from "wagmi/actions";
import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { clearPrivateKey, getStoredKey, storePrivateKey } from "#/connectors/privateKey";
import { useScanUrlImport } from "#/lib/scan-url-import";
import {
  clearWebAuthnCredential,
  getWebAuthnCredential,
  storeWebAuthnCredential,
} from "#/lib/webauthn-storage";
import { AppI18nProvider } from "#/providers/i18n";
import { Web3Provider } from "#/providers/web3";
import { pkConnector, wagmiConfig } from "#/providers/web3-config";
import appCss from "../styles.css?url";

// Runs synchronously in <head> before first paint so the correct color scheme
// is applied with no flash: read the stored choice, else autodetect the device
// preference (and seed it for next time). Keep in sync with #/providers/theme.
const themeBootstrapScript = `(function(){try{var k="clc.theme",s=localStorage.getItem(k),t=s==="light"||s==="dark"?s:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";if(s!==t)localStorage.setItem(k,t);var r=document.documentElement;r.classList.toggle("dark",t==="dark");r.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="dark"?"#141414":"#f2f2f2")}catch(e){}})();`;

const AppDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("#/components/devtools").then((module) => ({
        default: module.AppDevtools,
      })),
    )
  : null;

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
  const { pendingKey, clearPendingKey } = useScanUrlImport();
  const [switching, setSwitching] = useState(false);

  const pendingAddress = useMemo(
    () => (pendingKey ? privateKeyToAccount(pendingKey).address : null),
    [pendingKey],
  );

  async function handleConfirmSwitch() {
    if (!pendingKey) return;
    setSwitching(true);
    const previousPrivateKey = getStoredKey();
    const previousWebAuthnCredential = getWebAuthnCredential();
    try {
      storePrivateKey(pendingKey);
      await connect(wagmiConfig, { connector: pkConnector });
      clearWebAuthnCredential();
      clearPendingKey();
    } catch {
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
    } finally {
      setSwitching(false);
    }
  }

  return (
    <>
      <Outlet />
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
              <DialogTitle className="font-semibold text-base">
                <Trans>Switch wallet?</Trans>
              </DialogTitle>
              <p className="mt-1 text-muted-foreground text-sm">
                <Trans>A paper wallet QR was scanned. Import this address?</Trans>
              </p>
              <p className="mt-2 truncate font-mono text-foreground text-xs">{pendingAddress}</p>
              <div className="mt-5 flex flex-col gap-2">
                <Button className="h-11 w-full" disabled={switching} onClick={handleConfirmSwitch}>
                  {switching ? t`Switching…` : t`Switch wallet`}
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
            </DialogContent>
          </DialogPortal>
        </DialogRoot>
      ) : null}
    </>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
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
    void (async () => {
      try {
        const { Serwist } = await import("@serwist/window");
        if (cancelled) return;
        const serwist = new Serwist("/sw.js", { scope: "/", type: "module" });
        await serwist.register();
      } catch (err) {
        console.error("[sw] registration failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: synchronous pre-paint theme bootstrap, no user input */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        {children}
        <Toaster richColors closeButton />
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
