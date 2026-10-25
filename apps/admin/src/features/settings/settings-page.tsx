import { resolveRelyingPartyId } from "@clc/core/features/webauthn/rp-id";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "#/components/admin/page-header";
import { BUILD_INFO } from "#/features/app-updates/build-info";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Label } from "#/components/ui/label";
import { Switch } from "#/components/ui/switch";
import { API_ORIGIN, clcApi } from "#/lib/api";
import { BRAND } from "#/lib/brand";
import { CHAIN_ID } from "#/lib/chain";
import { useHydratedTheme } from "#/providers/theme";

const RELYING_PARTY_ID = resolveRelyingPartyId(
  import.meta.env.VITE_RELYING_PARTY_ID as string | undefined,
);

export function SettingsPage() {
  const { theme, setTheme } = useHydratedTheme();
  const credentials = useQuery({
    queryKey: ["clc", "admin", "settings", "credentials"],
    queryFn: () => clcApi.auth.getWebAuthnCredentials(),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="font-heading text-base font-semibold tracking-tight">
              Appearance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-4">
            <div className="border-border flex items-center justify-between gap-4 border px-3 py-2.5">
              <div className="space-y-1">
                <Label htmlFor="dark-mode" className="font-heading text-sm font-medium">
                  Dark mode
                </Label>
              </div>
              <Switch
                id="dark-mode"
                checked={theme === "dark"}
                onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
              />
            </div>

            <div className="border-border bg-muted/30 text-muted-foreground border px-3 py-2.5 text-xs">
              <kbd className="border-border bg-background border px-1 font-mono">⌘K</kbd> command
              palette · <kbd className="border-border bg-background border px-1 font-mono">⌘B</kbd>{" "}
              sidebar
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="font-heading text-base font-semibold tracking-tight">
              Build
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {/* What this tab is running. The live deployment is /build-info.json. */}
            <dl className="-mx-1.5">
              <BuildRow label="Version" value={BUILD_INFO.version} />
              <BuildRow label="Build number" value={String(BUILD_INFO.buildNumber)} />
              <BuildRow label="Minimum build" value={String(BUILD_INFO.minimumBuild)} />
              <BuildRow
                label="Commit"
                value={`${BUILD_INFO.gitSha}${BUILD_INFO.dirty ? " (dirty)" : ""}`}
              />
              <BuildRow label="Built at" value={BUILD_INFO.builtAt} />
              <BuildRow label="Build ID" value={BUILD_INFO.buildId.slice(0, 16)} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="font-heading text-base font-semibold tracking-tight">
              Environment
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <dl className="-mx-1.5">
              <BuildRow label="Chain" value={String(CHAIN_ID)} />
              <BuildRow label="API" value={API_ORIGIN || "—"} />
              <BuildRow label="Brand" value={BRAND} />
              <BuildRow label="Relying party" value={RELYING_PARTY_ID} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="font-heading text-base font-semibold tracking-tight">
              Passkeys
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {credentials.isPending ? (
              <p className="text-muted-foreground font-data text-xs">Reading</p>
            ) : credentials.isError ? (
              <p className="text-muted-foreground font-data text-xs">Unavailable</p>
            ) : credentials.data.credentials.length === 0 ? (
              <p className="text-muted-foreground font-data text-xs">None</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {credentials.data.credentials.map((credential) => (
                  <li
                    key={credential.credentialId}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="font-data min-w-0 truncate text-xs">
                      {credential.credentialId.slice(0, 16)}
                    </span>
                    <span className="font-mono text-xs uppercase">{credential.state}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BuildRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-1.5 py-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd aria-label={label} className="font-data min-w-0 truncate text-right text-xs">
        {value}
      </dd>
    </div>
  );
}
