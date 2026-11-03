import { buildPaperWalletUrl } from "@clc/core/features/wallet/paper-wallet";
import { encryptPaperWalletPrivateKey } from "@clc/core/features/wallet/paper-wallet-encryption";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { Label } from "#/components/ui/label";
import { PasswordInput } from "#/components/ui/password-input";
import { downloadBlob } from "#/features/paper-wallets/download";
import { renderPaperWalletSheet } from "#/features/paper-wallets/render-sheet";
import { PAPER_WALLET_ORIGIN } from "#/lib/paper-wallet";

import { useRotateUserKey } from "../use-admin-users";
import { parseUserDetailSearch } from "../user-detail-search";

/**
 * Moves an account to a new sign-in card the operator issues here, for a holder
 * who can no longer sign with the old one. The key exists only in this dialog
 * and in the downloaded card; closing the dialog drops it.
 */
export function ReplaceCardDialog({
  address,
  name,
  onClose,
}: {
  address: string;
  name: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const rotate = useRotateUserKey();
  const [newKey] = useState(() => generatePrivateKey());
  const newAddress = privateKeyToAccount(newKey).address;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [handedOver, setHandedOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = downloading || rotate.isPending;

  async function download() {
    setError(null);
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    setDownloading(true);
    try {
      const payload = password ? await encryptPaperWalletPrivateKey(newKey, password) : newKey;
      const blob = await renderPaperWalletSheet(
        [{ address: newAddress, name, qrUrl: buildPaperWalletUrl(PAPER_WALLET_ORIGIN, payload) }],
        { website: "cosmolocal.credit", description: "", logoDataUrl: null },
        { hairlines: false },
      );
      downloadBlob(blob, `sign-in-card-${newAddress}.pdf`);
      setDownloaded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The card could not be made.");
    } finally {
      setDownloading(false);
    }
  }

  function replace() {
    setError(null);
    rotate.mutate(
      { address, newKey },
      {
        onSuccess: (result) => {
          toast.success("Account moved to the new card.");
          onClose();
          void navigate({
            to: "/users/$address",
            params: { address: result.address },
            search: parseUserDetailSearch({}),
          });
        },
        onError: (cause) => setError(cause.message),
      },
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move to a new card</DialogTitle>
          <DialogDescription>
            The old card stops signing in. Vouchers, pools and balances stay with the old wallet
            until the old card is found and moves them.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="replace-card-password">Card password (optional)</Label>
            <PasswordInput
              id="replace-card-password"
              autoComplete="new-password"
              value={password}
              disabled={busy || downloaded}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {password ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="replace-card-confirm">Confirm password</Label>
              <PasswordInput
                id="replace-card-confirm"
                autoComplete="new-password"
                value={confirm}
                disabled={busy || downloaded}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
          ) : null}
          <Button type="button" variant="outline" disabled={busy} onClick={() => void download()}>
            {downloading ? "Making card…" : downloaded ? "Download again" : "Download card"}
          </Button>
          <div className="flex items-start gap-2">
            <Checkbox
              id="replace-card-handed-over"
              checked={handedOver}
              disabled={!downloaded || busy}
              onCheckedChange={(checked) => setHandedOver(checked === true)}
            />
            <Label htmlFor="replace-card-handed-over" className="font-normal">
              The holder has the new card
            </Label>
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!downloaded || !handedOver || busy}
            onClick={replace}
          >
            {rotate.isPending ? "Moving…" : "Move account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
