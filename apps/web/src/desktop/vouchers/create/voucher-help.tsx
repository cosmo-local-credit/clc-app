import { Trans } from "@lingui/react/macro";
import { RiQuestionLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { PopoverContent, PopoverRoot, PopoverTitle, PopoverTrigger } from "#/components/ui/popover";

/**
 * "What's a voucher?" on request. The explanation used to sit beside the form
 * on every visit; it is the same words, shown only to someone who asks.
 */
export function VoucherHelp() {
  return (
    <PopoverRoot>
      <PopoverTrigger render={<Button variant="ghost" />}>
        <RiQuestionLine aria-hidden="true" />
        <Trans>What's a voucher?</Trans>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-80 gap-2">
        <PopoverTitle className="font-heading text-sm font-semibold">
          <Trans>What's a voucher?</Trans>
        </PopoverTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          <Trans>
            A voucher acts like a gift card for your offers. When someone redeems your voucher, you
            are committing to provide them with your offers.
          </Trans>
        </p>
      </PopoverContent>
    </PopoverRoot>
  );
}
