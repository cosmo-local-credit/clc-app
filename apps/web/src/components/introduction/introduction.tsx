import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { introductionSlides as slides } from "./introduction-content";
import { LanguageSelector } from "#/components/language-selector";
import { Button } from "#/components/ui/button";
import { CLCLogo } from "#/components/ui/clc-logo";
import { SectionHeading } from "#/components/ui/section-heading";
import { StepProgress } from "#/components/ui/step-progress";
import { useLocale } from "#/providers/i18n";
import { cn } from "#/lib/utils";

type Props = { replay?: boolean } & (
  | { inline: true; onExit?: never }
  | { inline?: false; onExit: (action: "skip" | "create" | "signin" | "done") => void }
);

export function Introduction({ inline = false, replay = false, onExit }: Props) {
  const { i18n } = useLingui();
  const { loading, error } = useLocale();
  const [step, setStep] = useState(replay || inline ? 0 : -1);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!inline) heading.current?.focus();
  }, [step, loading, inline]);
  const slide = slides[step];
  const last = step === slides.length - 1;

  const Container = inline ? "section" : "main";
  const Heading = inline ? SectionHeading : "h1";

  return (
    <Container
      className={
        inline
          ? "flex w-full flex-col py-4"
          : "flex min-h-[100svh] w-full flex-col bg-background px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      }
    >
      {!inline ? (
        <header className="flex items-start justify-between gap-4">
          <CLCLogo className="size-10" sharp />
          {step >= 0 ? <LanguageSelector /> : null}
        </header>
      ) : null}
      {step < 0 ? (
        <section className="flex flex-1 flex-col gap-6 py-4">
          <Heading
            ref={heading}
            tabIndex={-1}
            className="break-words font-heading text-[1.75rem] font-bold leading-tight outline-none"
          >
            <Trans id="intro.language">Choose your language</Trans>
          </Heading>
          <LanguageSelector triggerClassName="h-12 w-full text-base" />
        </section>
      ) : loading || error ? (
        <div className="flex flex-1 items-center justify-center" role="status">
          {loading ? <Trans>Loading…</Trans> : null}
        </div>
      ) : (
        <section aria-live={inline ? "polite" : undefined} className="flex flex-1 flex-col py-4">
          <StepProgress step={step + 1} total={slides.length} />
          <div
            key={step}
            aria-hidden="true"
            className={cn(
              "mb-6 flex items-center justify-center gap-3 border border-border bg-card px-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300",
              inline ? "min-h-24" : "min-h-48",
            )}
          >
            {slide.icons.map((Icon, index) => (
              <div key={index} className="flex items-center gap-3">
                {index === 1 ? (
                  <ArrowRight className="size-4 text-muted-foreground rtl:-scale-x-100" />
                ) : null}
                <Icon
                  className={index === 1 ? "size-12 text-primary" : "size-9 text-foreground"}
                  strokeWidth={1.5}
                />
                {index === 1 ? (
                  <ArrowRight className="size-4 text-muted-foreground rtl:-scale-x-100" />
                ) : null}
              </div>
            ))}
          </div>
          {/* Every slide's text shares one grid cell, so the tallest one sets
              the height in every language and nothing around it moves as the
              slides change. Only the current slide is visible or announced. */}
          <div className="grid">
            {slides.map((item, index) => {
              const current = index === step;
              return (
                <div
                  key={index}
                  aria-hidden={current ? undefined : true}
                  className={cn(
                    "col-start-1 row-start-1",
                    current
                      ? "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
                      : "invisible",
                  )}
                >
                  <Heading
                    ref={current ? heading : undefined}
                    tabIndex={current ? -1 : undefined}
                    className={
                      inline
                        ? "mb-4 break-words outline-none"
                        : "mb-4 break-words font-heading text-[1.75rem] font-bold leading-tight outline-none"
                    }
                  >
                    {i18n._(item.title)}
                  </Heading>
                  <p className="break-words text-base leading-relaxed text-muted-foreground">
                    {i18n._(item.body)}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <footer className="space-y-3">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            <Trans id="intro.languageError">Choose a language again to continue.</Trans>
          </p>
        ) : null}
        <Button
          size="lg"
          className="w-full"
          disabled={loading || !!error}
          onClick={() =>
            inline
              ? setStep((step + 1) % slides.length)
              : last
                ? onExit?.(replay ? "done" : "create")
                : setStep(step + 1)
          }
        >
          {last && !inline ? (
            replay ? (
              <Trans>Done</Trans>
            ) : (
              <Trans>Create account</Trans>
            )
          ) : step < 0 ? (
            <Trans>Continue</Trans>
          ) : (
            <Trans>Next</Trans>
          )}
        </Button>
        {/* The second button's place is kept on every screen of the
            full-screen guide, so Next stays where Create account appears. */}
        {!replay && !inline ? (
          last ? (
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => onExit?.("signin")}
            >
              <Trans>I already have an account</Trans>
            </Button>
          ) : step < 0 ? (
            <Button variant="link" size="lg" className="w-full" onClick={() => onExit?.("signin")}>
              <Trans>I already have an account</Trans>
            </Button>
          ) : (
            <div aria-hidden="true" className="h-11" />
          )
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            tap
            disabled={step <= (replay || inline ? 0 : -1)}
            onClick={() => setStep(step - 1)}
          >
            <Trans>Back</Trans>
          </Button>
          {!inline ? (
            <Button variant="ghost" tap onClick={() => onExit?.(replay ? "done" : "skip")}>
              <Trans>Skip</Trans>
            </Button>
          ) : null}
        </div>
      </footer>
    </Container>
  );
}
