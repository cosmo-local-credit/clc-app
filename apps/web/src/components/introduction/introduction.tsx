import { getLocaleDirection, type SupportedLocale } from "@clc/i18n/locales";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { RiArrowLeftSLine, RiArrowRightSLine, RiCloseLine } from "react-icons/ri";

import { OnboardingScreen } from "#/components/onboarding-screen";
import { Button } from "#/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "#/components/ui/carousel";
import { PLATFORM_ABOUT_URL } from "#/lib/legal";
import { cn } from "#/lib/utils";
import { GuideArt } from "./guide-art";
import { introductionSlides as slides } from "./introduction-content";

/**
 * How to use CLC: one swipeable slide per idea, a picture over a title and a
 * sentence or two. Swipe, the arrows, a segment, or the arrow keys move it;
 * it stops at the last slide rather than wrapping.
 *
 * On Welcome it fills the space between the top bar and the account buttons,
 * and its first slide carries the page title. Elsewhere it is a section.
 */
export function GuideCarousel({
  welcome = false,
  onIndexChange,
  onApi,
}: {
  welcome?: boolean;
  onIndexChange?: (index: number) => void;
  onApi?: (api: CarouselApi) => void;
}) {
  const { i18n, t } = useLingui();
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);
  const direction = getLocaleDirection(i18n.locale as SupportedLocale);

  useEffect(() => {
    if (!api) return;
    onApi?.(api);
    const sync = () => {
      const selected = api.selectedScrollSnap();
      setIndex(selected);
      onIndexChange?.(selected);
    };
    sync();
    api.on("select", sync);
    api.on("reInit", sync);
    return () => {
      api.off("select", sync);
      api.off("reInit", sync);
    };
  }, [api, onApi, onIndexChange]);

  return (
    <Carousel
      setApi={setApi}
      direction={direction}
      aria-label={t({ id: "intro.replay", message: "How to use CLC" })}
      className="flex flex-[1_0_auto] flex-col"
    >
      <CarouselContent viewportClassName="flex flex-[1_0_auto]" className="ms-0 w-full">
        {slides.map((slide, slideIndex) => {
          const Heading = welcome && slideIndex === 0 ? "h1" : "h2";
          const current = slideIndex === index;
          return (
            <CarouselItem
              key={slide.art}
              inert={!current}
              aria-label={i18n._(slide.title)}
              className="flex flex-col ps-0"
            >
              <GuideArt name={slide.art} className="min-h-26 max-h-68 flex-1" />
              <div className="shrink-0 pt-5">
                <Heading className="break-words font-heading text-[1.75rem] font-bold leading-tight">
                  {i18n._(slide.title)}
                </Heading>
                <p className="mt-2 break-words text-muted-foreground leading-relaxed">
                  {i18n._(slide.body)}
                  {slide.about ? (
                    <>
                      {" "}
                      <a
                        href={PLATFORM_ABOUT_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground underline underline-offset-4 hover:text-primary"
                      >
                        <Trans>About Cosmo-Local Credit</Trans>
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
            </CarouselItem>
          );
        })}
      </CarouselContent>

      <div className="mt-3 flex shrink-0 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          tap
          aria-label={t`Back`}
          disabled={index === 0}
          onClick={() => api?.scrollPrev()}
        >
          <RiArrowLeftSLine className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </Button>
        <div className="flex flex-1 gap-1">
          {slides.map((slide, slideIndex) => (
            <button
              key={slide.art}
              type="button"
              aria-label={i18n._(slide.title)}
              aria-current={slideIndex === index ? "true" : undefined}
              onClick={() => api?.scrollTo(slideIndex)}
              className={cn(
                "relative h-[3px] flex-1 outline-none before:absolute before:-inset-y-5 before:inset-x-0 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground",
                slideIndex === index
                  ? "bg-foreground"
                  : slideIndex < index
                    ? "bg-muted-foreground"
                    : "bg-border",
              )}
            />
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          tap
          aria-label={t`Next`}
          disabled={index === slides.length - 1}
          onClick={() => api?.scrollNext()}
        >
          <RiArrowRightSLine className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </Button>
      </div>
    </Carousel>
  );
}

/** The guide on its own screen, replayed from Settings → How to use CLC. */
export function Introduction({ onDone }: { onDone: () => void }) {
  const { t } = useLingui();
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);
  const last = index === slides.length - 1;

  return (
    <OnboardingScreen
      menu={false}
      start={
        <Button variant="ghost" size="icon" tap aria-label={t`Close`} onClick={onDone}>
          <RiCloseLine className="size-4" aria-hidden="true" />
        </Button>
      }
      footer={
        <Button tap className="w-full" onClick={() => (last ? onDone() : api?.scrollNext())}>
          {last ? <Trans>Done</Trans> : <Trans>Next</Trans>}
        </Button>
      }
    >
      <h1 className="sr-only">{t({ id: "intro.replay", message: "How to use CLC" })}</h1>
      <GuideCarousel onApi={setApi} onIndexChange={setIndex} />
    </OnboardingScreen>
  );
}
