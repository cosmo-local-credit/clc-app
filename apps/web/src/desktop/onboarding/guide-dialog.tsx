import { Trans, useLingui } from "@lingui/react/macro";

import { introductionSlides } from "#/components/introduction/introduction-content";
import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { ConceptCards } from "./concept-cards";

/**
 * "How to use CLC" replayed on desktop: the welcome's guide, over the page the
 * person is on. A dialog rather than the welcome screen, because /onboarding
 * sends a signed-in member straight back out.
 */
export function DeskGuideDialog({ onDone }: { onDone: () => void }) {
  const { i18n, t } = useLingui();
  const [intro] = introductionSlides;

  return (
    <DialogRoot open onOpenChange={(open) => !open && onDone()}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogContent className="@container grid max-h-[calc(100dvh-3rem)] w-[min(1080px,calc(100vw-3rem))] max-w-none gap-6 overflow-y-auto rounded-none border border-border bg-background p-8 shadow-none">
          <div className="grid gap-2">
            <DialogTitle>
              {intro ? i18n._(intro.title) : t({ id: "intro.replay", message: "How to use CLC" })}
            </DialogTitle>
            {intro ? (
              <p className="max-w-[56ch] text-muted-foreground text-sm">{i18n._(intro.body)}</p>
            ) : null}
          </div>
          <ConceptCards />
          <div className="flex justify-end">
            <Button onClick={onDone}>
              <Trans>Done</Trans>
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}
