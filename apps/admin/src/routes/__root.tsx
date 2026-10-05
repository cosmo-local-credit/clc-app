import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RouteError } from "#/components/route-error";
import { AppUpdateBanner } from "#/features/app-updates/app-update-banner";
import { BRAND, BRAND_ICON_BASE, BRAND_THEME_COLOR } from "#/lib/brand";
import { themeBootstrapScript } from "#/providers/theme";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      // Back office: never index, never follow.
      { name: "robots", content: "noindex, nofollow" },
      { name: "theme-color", content: BRAND_THEME_COLOR.light },
      // Operators keep prod and staging open side by side; the title says which.
      { title: BRAND === "staging" ? "CLC Admin (staging)" : "CLC Admin" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: `${BRAND_ICON_BASE}/logo.svg` },
      { rel: "icon", type: "image/x-icon", href: `${BRAND_ICON_BASE}/favicon.ico` },
    ],
  }),
  shellComponent: RootDocument,
  component: AppContent,
  errorComponent: RouteError,
});

// The QueryClient lives in router context (so loaders can reach it) but React
// still needs it through a provider. apps/web gets this via Web3Provider; admin
// has no wagmi, so it provides the client directly.
function AppContent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      {/* Outside the auth shell, so a signed-out console is told too. */}
      <AppUpdateBanner />
      <Outlet />
    </QueryClientProvider>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-brand={BRAND} suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: synchronous pre-paint theme bootstrap, no user input */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
