import { PageHeader } from "#/components/admin/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Label } from "#/components/ui/label";
import { Switch } from "#/components/ui/switch";
import { useHydratedTheme } from "#/providers/theme";

export function SettingsPage() {
  const { theme, setTheme } = useHydratedTheme();

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
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Use a dark surface for this console.
                </p>
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
      </div>
    </div>
  );
}
