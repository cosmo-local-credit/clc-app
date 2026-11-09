import { useLingui } from "@lingui/react/macro";

import { GuideArt } from "#/components/introduction/guide-art";
import { introductionSlides } from "#/components/introduction/introduction-content";

/**
 * The guide the phone pages through, laid out at once. Each concept keeps the
 * diagram the phone draws for it (`GuideArt`), on the card's own surface: the
 * width here is what a slider was working around, so there is nothing to page.
 * The art keeps the diagram's own 300:160, so it grows with the column instead
 * of sitting small in a wide box.
 */
export function ConceptCards() {
  const { i18n } = useLingui();
  const [, ...concepts] = introductionSlides;

  return (
    // Two columns while the area is narrow, so a card keeps room for its sentence.
    <div className="grid grid-cols-1 gap-4 @min-[30rem]:grid-cols-2 @min-[45rem]:grid-cols-3">
      {concepts.map((concept) => (
        <div key={concept.art} className="flex flex-col border border-border bg-card">
          {/* The art is the card's own top region, so the two rules never double up. */}
          <GuideArt name={concept.art} className="aspect-[300/160] border-0 border-b bg-muted" />
          <div className="p-4">
            <h2 className="font-heading text-base font-semibold">{i18n._(concept.title)}</h2>
            <p className="mt-1.5 text-muted-foreground text-sm">{i18n._(concept.body)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
