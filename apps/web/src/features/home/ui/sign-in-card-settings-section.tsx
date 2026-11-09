import { useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { RiFingerprintLine, RiInboxUnarchiveLine, RiRefreshLine } from "react-icons/ri";

import { PasskeyRenameNotice } from "#/components/passkey-rename-notice";
import { ActionRow } from "#/components/ui/action-row";
import { useSignInCardSettings } from "#/features/key-rotation/hooks/use-sign-in-card-settings";
import { KEY_ROTATION_ENABLED } from "#/lib/key-rotation-config";

/**
 * Replacing a compromised sign-in card, and the two things that can be left
 * after one: assets still on the old card, and a passkey not yet registered on
 * the new one.
 */
export function SignInCardSettingsSection({ address }: { address?: `0x${string}` }) {
  if (!KEY_ROTATION_ENABLED || !address) return null;
  return <SignInCardRows address={address} />;
}

function SignInCardRows({ address }: { address: `0x${string}` }) {
  const { t } = useLingui();
  const { latest, canRelink, relinking, passkeyMoved, finishPasskeyMove } =
    useSignInCardSettings(address);

  return (
    <>
      <ActionRow
        icon={<RiRefreshLine className="size-4" aria-hidden="true" />}
        label={t`Replace sign-in card`}
        render={<Link to="/settings/sign-in-card" />}
      />
      {latest ? (
        <ActionRow
          icon={<RiInboxUnarchiveLine className="size-4" aria-hidden="true" />}
          label={t`Move what's left from an old card`}
          render={<Link to="/settings/sign-in-card" search={{ from: latest.oldAddress }} />}
        />
      ) : null}
      {canRelink ? (
        <ActionRow
          icon={<RiFingerprintLine className="size-4" aria-hidden="true" />}
          busy={relinking}
          label={relinking ? t`Moving passkey…` : t`Finish moving your passkey`}
          onClick={finishPasskeyMove}
        />
      ) : null}
      {passkeyMoved ? <PasskeyRenameNotice /> : null}
    </>
  );
}
