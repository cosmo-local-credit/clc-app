import { SectionLabel } from "#/components/admin/section-heading";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";

export type ProtectionDraft = {
  kind: "password" | "none";
  passphrase: string;
  confirmation: string;
};

export function protectionError(draft: ProtectionDraft): string | null {
  if (draft.kind === "none") return null;
  if (draft.passphrase.trim().length < 6) return "Use a password of at least 6 characters.";
  if (draft.passphrase !== draft.confirmation) return "The passwords do not match.";
  return null;
}

/**
 * How each card's QR protects its key.
 *
 * A password-protected card holds a BIP38-encrypted key: a lost or photographed
 * card is useless without the batch password, which the steward hands over in
 * person. An unprotected card holds the raw key and opens in one scan — simpler
 * for the holder, and anyone who sees the QR owns the wallet.
 */
export function ProtectionFields({
  value,
  onChange,
  carrier = "QR code",
}: {
  value: ProtectionDraft;
  carrier?: "QR code" | "NFC card";
  onChange: (next: ProtectionDraft) => void;
}) {
  return (
    <div className="space-y-4">
      <SectionLabel>{carrier === "NFC card" ? "Card protection" : "QR protection"}</SectionLabel>
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={[value.kind]}
        onValueChange={(values) => {
          const next = values[0] as ProtectionDraft["kind"] | undefined;
          if (next) onChange({ ...value, kind: next });
        }}
      >
        <ToggleGroupItem value="password">Batch password</ToggleGroupItem>
        <ToggleGroupItem value="none">No password</ToggleGroupItem>
      </ToggleGroup>
      {value.kind === "password" ? (
        <>
          <p className="text-muted-foreground text-sm">
            Share this password separately. It is not stored.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="paper-wallet-passphrase">Password</Label>
              <Input
                id="paper-wallet-passphrase"
                type="password"
                autoComplete="new-password"
                value={value.passphrase}
                onChange={(event) => onChange({ ...value, passphrase: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paper-wallet-confirmation">Confirm password</Label>
              <Input
                id="paper-wallet-confirmation"
                type="password"
                autoComplete="new-password"
                value={value.confirmation}
                onChange={(event) => onChange({ ...value, confirmation: event.target.value })}
              />
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Anyone with this {carrier} controls the wallet.
        </p>
      )}
    </div>
  );
}
