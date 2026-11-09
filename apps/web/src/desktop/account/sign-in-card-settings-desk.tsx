import { useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { PasskeyRenameNotice } from "#/components/passkey-rename-notice";
import { Button } from "#/components/ui/button";
import { EllipsizedAddress } from "#/components/wallet/wallet-address";
import { useSignInCardSettings } from "#/features/key-rotation/hooks/use-sign-in-card-settings";
import { KEY_ROTATION_ENABLED } from "#/lib/key-rotation-config";

import { SetRow } from "./set-row";

/**
 * The phone's sign-in card rows: replacing the card, moving what is left on
 * the last one replaced, and finishing a passkey move the new card has not
 * registered. Gated as on the phone.
 */
export function SignInCardSettingsDeskRows({ address }: { address?: `0x${string}` }) {
  if (!KEY_ROTATION_ENABLED || !address) return null;
  return <SignInCardRows address={address} />;
}

function SignInCardRows({ address }: { address: `0x${string}` }) {
  const { t } = useLingui();
  const { latest, canRelink, relinking, passkeyMoved, finishPasskeyMove } =
    useSignInCardSettings(address);

  return (
    <>
      <SetRow
        label={t`Sign-in card`}
        action={
          <Button asChild variant="ghost">
            <Link to="/settings/sign-in-card">{t`Replace sign-in card`}</Link>
          </Button>
        }
      />
      {latest ? (
        <SetRow
          label={t`Move what's left from an old card`}
          value={<EllipsizedAddress address={latest.oldAddress} className="text-foreground" />}
          action={
            <Button asChild variant="ghost">
              <Link to="/settings/sign-in-card" search={{ from: latest.oldAddress }}>
                {t`Move what's left`}
              </Link>
            </Button>
          }
        />
      ) : null}
      {canRelink ? (
        <SetRow
          label={t`Finish moving your passkey`}
          action={
            <Button variant="outline" pending={relinking} onClick={finishPasskeyMove}>
              {relinking ? t`Moving passkey…` : t`Continue`}
            </Button>
          }
        />
      ) : null}
      {passkeyMoved ? (
        <div className="p-4">
          <PasskeyRenameNotice />
        </div>
      ) : null}
    </>
  );
}
