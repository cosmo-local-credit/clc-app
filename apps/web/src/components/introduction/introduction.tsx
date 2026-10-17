import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { introductionSlides as slides } from "./introduction-content";
import { LanguageSelector } from "#/components/language-selector";
import { Button } from "#/components/ui/button";
import { CLCLogo } from "#/components/ui/clc-logo";
import { StepProgress } from "#/components/ui/step-progress";
import { useLocale } from "#/providers/i18n";

type Props = { replay?: boolean; onExit: (action: "skip" | "create" | "signin" | "done") => void };

export function Introduction({ replay = false, onExit }: Props) {
  const { i18n } = useLingui();
  const { loading, error } = useLocale();
  const [step, setStep] = useState(replay ? 0 : -1);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step, loading]);
  const slide = slides[step];
  const last = step === slides.length - 1;

  return (
    <main className="mx-auto flex min-h-[100svh] w-full max-w-lg flex-col bg-background px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-start justify-between gap-4">
        <CLCLogo className="size-10" sharp />
        {step >= 0 ? <LanguageSelector /> : null}
      </header>
      {step < 0 ? (
        <section className="flex flex-1 flex-col justify-center gap-6 py-12">
          <h1
            ref={heading}
            tabIndex={-1}
            className="break-words font-heading text-[1.75rem] font-bold leading-tight outline-none"
          >
            <Trans id="intro.language">Choose your language</Trans>
          </h1>
          <LanguageSelector triggerClassName="h-12 w-full text-base" />
        </section>
      ) : loading || error ? (
        <div className="flex flex-1 items-center justify-center" role="status">
          {loading ? <Trans>Loading…</Trans> : null}
        </div>
      ) : (
        <section
          key={step}
          className="flex flex-1 flex-col justify-center py-8 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
        >
          <StepProgress step={step + 1} total={slides.length} />
          <div
            aria-hidden="true"
            className="mb-8 flex min-h-48 items-center justify-center gap-3 border border-border bg-card px-4"
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
          <h1
            ref={heading}
            tabIndex={-1}
            className="mb-4 break-words font-heading text-[1.75rem] font-bold leading-tight outline-none"
          >
            {i18n._(slide.title)}
          </h1>
          <p className="break-words text-base leading-relaxed text-muted-foreground">
            {i18n._(slide.body)}
          </p>
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
          onClick={() => (last ? onExit(replay ? "done" : "create") : setStep(step + 1))}
        >
          {last ? (
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
        {last && !replay ? (
          <Button variant="outline" size="lg" className="w-full" onClick={() => onExit("signin")}>
            <Trans>I already have an account</Trans>
          </Button>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            tap
            disabled={step <= (replay ? 0 : -1)}
            onClick={() => setStep(step - 1)}
          >
            <Trans>Back</Trans>
          </Button>
          <Button variant="ghost" tap onClick={() => onExit(replay ? "done" : "skip")}>
            <Trans>Skip</Trans>
          </Button>
        </div>
        {step < 0 && !replay ? (
          <Button variant="link" size="lg" className="w-full" onClick={() => onExit("signin")}>
            <Trans>I already have an account</Trans>
          </Button>
        ) : null}
      </footer>
    </main>
  );
}
