import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { IconType } from "react-icons";
import {
  RiArrowLeftDownLine,
  RiArrowRightUpLine,
  RiBubbleChartLine,
  RiCheckLine,
  RiCouponLine,
  RiLayoutGridLine,
  RiMap2Line,
  RiWallet3Line,
} from "react-icons/ri";

import {
  SignInCanvasProvider,
  SignInPanel,
  type SignInCanvasApi,
  type SignInCanvasStage,
} from "#/components/auth/sign-in-panel";
import { InstallAppButton } from "#/components/install-app-button";
import type { GuideArtName } from "#/components/introduction/guide-art";
import { introductionSlides } from "#/components/introduction/introduction-content";
import { completeIntroduction } from "#/components/introduction/introduction-state";
import { PaperWalletScanner } from "#/components/paper-wallet-scanner";
import { Button } from "#/components/ui/button";
import { CLCLogo } from "#/components/ui/clc-logo";
import { DeskStep, DeskStepper } from "#/desktop/ui/stepper";
import { OnboardingFlow } from "#/features/onboarding/ui/onboarding-flow";
import {
  isPasskeyPlatformAvailable,
  pickPasskeyProvider,
} from "#/features/webauthn/hooks/use-platform-passkey-label";
import { onboardingSearch, type OnboardingStep } from "#/lib/onboarding-search";
import { cn } from "#/lib/utils";

type SetupStep = Exclude<OnboardingStep, "welcome" | "signin">;

/**
 * Onboarding without the app shell. Welcome and sign-in share one split: the
 * concepts (or the camera) on the gray canvas and a 420px white column that
 * swaps between the two. Setup is the step list beside a 760px form column.
 */
export function OnboardingDesk({
  step,
  redirectTo,
}: {
  step: OnboardingStep;
  redirectTo?: string;
}) {
  if (step === "welcome" || step === "signin") {
    return <SignInSplit step={step} redirectTo={redirectTo} />;
  }
  return (
    <div className="h-dvh overflow-y-auto bg-background">
      <div className="grid grid-cols-[260px_minmax(0,760px)] content-start gap-10 px-12 py-10">
        <div className="flex flex-col gap-4">
          <Brand />
          <SetupStepper step={step} redirectTo={redirectTo} />
        </div>
        <div className="flex min-h-150 min-w-0 flex-col">
          <Suspense fallback={null}>
            <OnboardingFlow step={step} redirectTo={redirectTo} embedded />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function SignInSplit({ step, redirectTo }: { step: "welcome" | "signin"; redirectTo?: string }) {
  const api = useRef<SignInCanvasApi | null>(null);
  const [stage, setStage] = useState<SignInCanvasStage>({ mode: "concept", error: null });
  const host = useMemo(() => ({ setStage, api }), []);
  const camera = step === "signin" && stage.mode !== "concept";

  useEffect(() => {
    if (step !== "signin" || stage.mode === "concept") return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (stage.mode === "scanner") api.current?.closeScanner();
      else api.current?.resumeScanner();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, stage.mode]);

  return (
    <SignInCanvasProvider host={host}>
      <div className="grid h-dvh grid-cols-[minmax(0,1fr)_420px] bg-background">
        {camera ? (
          <CameraCanvas
            stage={stage}
            onKeyDecoded={(raw) => api.current?.onKeyDecoded(raw)}
            onCancel={() => api.current?.closeScanner()}
          />
        ) : (
          <div className="grid min-h-0 content-start gap-7 overflow-y-auto p-12">
            <Brand />
            <ConceptGrid />
          </div>
        )}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto border-border border-s bg-card px-10 py-12">
          {step === "welcome" ? (
            <WelcomeActions redirectTo={redirectTo} />
          ) : (
            <SignInPanel
              embedded
              redirectTo={redirectTo}
              onAuthenticated={() => {}}
              createAccountStep="profile"
            />
          )}
        </div>
      </div>
    </SignInCanvasProvider>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <CLCLogo className="size-6 shrink-0" sharp />
      <span className="font-heading text-lg font-bold">CLC</span>
    </div>
  );
}

/**
 * The camera fills the canvas. The scanner keeps its own controls, so it sits
 * in a white tile over the dark field; a captured card shows the frame and a
 * check while the password is asked for on the right.
 */
function CameraCanvas({
  stage,
  onKeyDecoded,
  onCancel,
}: {
  stage: SignInCanvasStage;
  onKeyDecoded: (raw: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="relative grid min-h-0 place-items-center overflow-y-auto bg-black p-12">
      {stage.mode === "scanner" ? (
        <div className="w-full max-w-md border border-border bg-card p-4">
          <PaperWalletScanner onKeyDecoded={onKeyDecoded} onCancel={onCancel} />
          {stage.error ? (
            <p role="alert" className="mt-3 text-destructive text-xs">
              {stage.error}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="relative grid size-56 place-items-center outline-2 outline-primary">
          <span className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground">
            <RiCheckLine className="size-6" aria-hidden="true" />
          </span>
        </div>
      )}
    </div>
  );
}

const CONCEPT_ICONS: Partial<Record<GuideArtName, { icon: IconType; className?: string }>> = {
  voucher: { icon: RiCouponLine, className: "text-voucher-ink" },
  offer: { icon: RiLayoutGridLine, className: "text-voucher-ink" },
  pool: { icon: RiBubbleChartLine, className: "text-pool-ink" },
  send: { icon: RiArrowRightUpLine },
  receive: { icon: RiArrowLeftDownLine },
  wallet: { icon: RiWallet3Line },
};

function ConceptGrid() {
  const { i18n } = useLingui();
  const [intro, ...concepts] = introductionSlides;
  if (!intro) return null;

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="max-w-[18ch] font-heading text-[1.75rem] font-bold leading-tight">
          {i18n._(intro.title)}
        </h1>
        <p className="max-w-[56ch] text-muted-foreground">{i18n._(intro.body)}</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {concepts.map((concept) => {
          const art = CONCEPT_ICONS[concept.art];
          return (
            <div key={concept.art} className="border border-border bg-card p-4">
              {art ? <art.icon className={cn("size-5", art.className)} aria-hidden="true" /> : null}
              <h2 className="mt-2.5 font-heading text-base font-semibold">
                {i18n._(concept.title)}
              </h2>
              <p className="mt-1.5 text-muted-foreground text-sm">{i18n._(concept.body)}</p>
            </div>
          );
        })}
      </div>
    </>
  );
}

function WelcomeActions({ redirectTo }: { redirectTo?: string }) {
  const navigate = useNavigate();

  function go(next: "profile" | "signin") {
    completeIntroduction();
    void navigate({ to: "/onboarding", search: onboardingSearch(next, redirectTo) });
  }

  return (
    <>
      <Button className="w-full" onClick={() => go("profile")}>
        <Trans>Create account</Trans>
      </Button>
      <Button variant="outline" className="w-full" onClick={() => go("signin")}>
        <Trans>I already have an account</Trans>
      </Button>
      <div className="mt-2 grid grid-cols-2 gap-4">
        <Button
          variant="ghost"
          className="min-w-0"
          onClick={() => {
            completeIntroduction();
            void navigate({ to: "/" });
          }}
        >
          <RiMap2Line aria-hidden="true" />
          <Trans>Market</Trans>
        </Button>
        <InstallAppButton quiet />
      </div>
    </>
  );
}

function SetupStepper({ step, redirectTo }: { step: SetupStep; redirectTo?: string }) {
  const { t } = useLingui();
  const [passkey] = useState(() => isPasskeyPlatformAvailable());
  const providerLabel = pickPasskeyProvider() === "apple" ? "Apple ID" : "Google";
  const steps: SetupStep[] = passkey
    ? ["profile", "contact", "location", "card", "save", "link"]
    : ["profile", "contact", "location", "card", "save"];
  const current = steps.indexOf(step);

  return (
    <DeskStepper label={t`Create account`}>
      {steps.map((id, index) => {
        const state = index < current ? "complete" : index === current ? "current" : "upcoming";
        return (
          <DeskStep
            key={id}
            index={index + 1}
            state={state}
            label={<StepLabel id={id} providerLabel={providerLabel} />}
            wrap={
              state === "upcoming"
                ? undefined
                : (body) => (
                    <Link
                      to="/onboarding"
                      search={onboardingSearch(id, redirectTo)}
                      className="outline-none focus-visible:outline-2 focus-visible:outline-foreground"
                    >
                      {body}
                    </Link>
                  )
            }
          />
        );
      })}
    </DeskStepper>
  );
}

function StepLabel({ id, providerLabel }: { id: SetupStep; providerLabel: string }) {
  const { t } = useLingui();
  const label: Record<SetupStep, ReactNode> = {
    profile: <Trans>Create your account</Trans>,
    contact: <Trans>Contact</Trans>,
    location: <Trans>Location</Trans>,
    card: <Trans>Your paper wallet</Trans>,
    save: <Trans>Save your card</Trans>,
    link: t`Link ${providerLabel}?`,
  };
  return label[id];
}
