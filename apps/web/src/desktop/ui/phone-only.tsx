import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { RiFileCopyLine } from "react-icons/ri";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { AddressQRCode } from "#/components/wallet";
import { DeskCanvas, DeskPanel, DeskTitle } from "#/desktop/ui/page";

/**
 * Web NFC is Chrome on Android, so the desktop view cannot run this task. It
 * says so and hands the task to the phone: a QR and a link to the same route
 * on this origin, which is all the phone needs. `href` is a plain route path
 * with at most public context in its search (a token address); it never
 * carries a key, a session or a credential, and the phone signs in for itself.
 */
export function DesktopPhoneOnly({ title, href }: { title: ReactNode; href: string }) {
  const { t } = useLingui();
  const link = new URL(href, window.location.origin).href;

  const copy = () => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy link`);
      return;
    }
    void navigator.clipboard
      .writeText(link)
      .then(() => toast.success(t`Link copied`))
      .catch(() => toast.error(t`Couldn't copy link`));
  };

  return (
    <DeskCanvas width="read">
      <DeskTitle>{title}</DeskTitle>
      <DeskPanel className="grid min-w-0 items-start gap-5 @3xl:grid-cols-[auto_minmax(0,1fr)]">
        <div className="w-fit border border-border bg-card">
          <AddressQRCode value={link} size={200} />
        </div>
        <div className="grid min-w-0 content-start gap-3">
          <p className="text-sm font-semibold">
            <Trans>Open CLC in Chrome on Android to collect with an NFC card.</Trans>
          </p>
          <p className="font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]" dir="ltr">
            {link}
          </p>
          <Button type="button" variant="outline" className="justify-self-start" onClick={copy}>
            <RiFileCopyLine aria-hidden="true" />
            <Trans>Copy link</Trans>
          </Button>
        </div>
      </DeskPanel>
    </DeskCanvas>
  );
}
