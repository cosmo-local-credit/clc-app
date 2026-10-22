import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { RiExternalLinkLine, RiFileTextLine, RiInformationLine, RiMenuLine } from "react-icons/ri";

import { LanguageSelector } from "#/components/language-selector";
import { ThemeToggle } from "#/components/theme-selector";
import { VisibilitySelector } from "#/components/visibility-selector";
import { Button } from "#/components/ui/button";
import {
  PopoverClose,
  PopoverContent,
  PopoverRoot,
  PopoverTitle,
  PopoverTrigger,
} from "#/components/ui/popover";
import { PLATFORM_ABOUT_URL, PLATFORM_TERMS_URL } from "#/lib/legal";

/** One width for both selectors, so neither reads as the longer control. */
const SELECTOR_TRIGGER_CLASS_NAME = "w-32";

const actionClassName =
  "flex min-h-11 w-full items-center gap-3 px-3 py-2 text-start text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring";

export function AppMenu({ className }: { className?: string }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
  }

  return (
    <div className={className}>
      <PopoverRoot open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="icon-lg"
              className="text-foreground"
              aria-label={t`Open menu`}
            />
          }
        >
          <RiMenuLine className="size-5" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[calc(100vw-2rem)] max-w-72 p-2"
          aria-label={t`App menu`}
        >
          <PopoverTitle className="sr-only">
            <Trans>App menu</Trans>
          </PopoverTitle>

          <a
            href={PLATFORM_ABOUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={actionClassName}
            onClick={close}
          >
            <RiInformationLine className="size-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <Trans>About</Trans>
            </span>
            <RiExternalLinkLine className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
          </a>

          <div className="my-1 h-px bg-border" />

          <div className="flex min-h-11 items-start justify-between gap-3 px-3 py-2">
            <span className="pt-2 text-sm">
              <Trans>Language</Trans>
            </span>
            <LanguageSelector triggerClassName={SELECTOR_TRIGGER_CLASS_NAME} />
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
            <span className="text-sm">
              <Trans>Theme</Trans>
            </span>
            <ThemeToggle className={SELECTOR_TRIGGER_CLASS_NAME} />
          </div>

          <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
            <span className="text-sm">
              <Trans>Visibility</Trans>
            </span>
            <VisibilitySelector triggerClassName={SELECTOR_TRIGGER_CLASS_NAME} />
          </div>

          <div className="my-1 h-px bg-border" />

          <a
            href={PLATFORM_TERMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={actionClassName}
            onClick={close}
          >
            <RiFileTextLine className="size-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <Trans>Terms of Service</Trans>
            </span>
            <RiExternalLinkLine className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
          </a>

          <PopoverClose className="sr-only">
            <Trans>Close menu</Trans>
          </PopoverClose>
        </PopoverContent>
      </PopoverRoot>
    </div>
  );
}
