import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { IconType } from "react-icons";
import {
  RiCheckLine,
  RiGroupLine,
  RiHandCoinLine,
  RiQrCodeLine,
  RiSendPlane2Line,
  RiStore2Line,
  RiWallet3Line,
} from "react-icons/ri";

import {
  SignInCanvasProvider,
  SignInPanel,
  type SignInCanvasApi,
  type SignInCanvasStage,
} from "#/components/auth/sign-in-panel";
import { PaperWalletScanner } from "#/components/paper-wallet-scanner";
import { InstallAppButton } from "#/components/install-app-button";
import { introductionSlides } from "#/components/introduction/introduction-content";
import type { GuideArtName } from "#/components/introduction/guide-art";
import { completeIntroduction } from "#/components/introduction/introduction-state";
import { OnboardingTitle } from "#/components/onboarding-screen";
import { Button } from "#/components/ui/button";
import { CLCLogo } from "#/components/ui/clc-logo";
import { DeskStep, DeskStepper } from "#/desktop/ui/stepper";
import { OnboardingFlow } from "#/features/onboarding/ui/onboarding-flow";
import {
  isPasskeyPlatformAvailable,
  pickPasskeyProvider,
} from "#/features/webauthn/hooks/use-platform-passkey-label";
import { onboardingSearch, type OnboardingStep } from "#/lib/onboarding-search";

type SetupStep = Exclude<OnboardingStep, "welcome" | "signin">;

export function OnboardingDesk({
  step,
  redirectTo,
}: {
  step: OnboardingStep;
  redirectTo?: string;
}) {
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
      <div className="h-dvh overflow-hidden bg-background">
        <aside
          className={
            camera
              ? "fixed inset-y-0 start-0 end-[420px] flex flex-col overflow-y-auto bg-black px-8 py-10 text-white"
              : "fixed inset-y-0 start-0 end-[420px] flex flex-col overflow-y-auto border-e border-border bg-card px-12 py-10"
          }
        >
          {camera ? null : <CLCLogo className="size-9 shrink-0" sharp />}
          <div
            className={
              camera ? "flex min-h-0 flex-1 flex-col" : "mt-10 flex min-h-0 flex-1 flex-col"
            }
          >
            {step === "signin" && stage.mode === "scanner" ? (
              <>
                <PaperWalletScanner
                  onKeyDecoded={(raw) => api.current?.onKeyDecoded(raw)}
                  onCancel={() => api.current?.closeScanner()}
                />
                {stage.error ? (
                  <p role="alert" className="mt-3 text-xs text-destructive">
                    {stage.error}
                  </p>
                ) : null}
              </>
            ) : step === "signin" && stage.mode === "captured" ? (
              <CapturedCard />
            ) : step === "welcome" || step === "signin" ? (
              <ConceptGrid />
            ) : (
              <SetupStepper step={step} redirectTo={redirectTo} />
            )}
          </div>
        </aside>
        <div className="ms-auto flex h-dvh w-[420px] min-w-0 flex-col overflow-y-auto px-8 py-10">
          {step === "welcome" ? <WelcomeActions redirectTo={redirectTo} /> : null}
          {step === "signin" ? <SignInColumn redirectTo={redirectTo} /> : null}
          {step !== "welcome" && step !== "signin" ? (
            <Suspense fallback={<div className="min-h-full bg-background" />}>
              <OnboardingFlow step={step} redirectTo={redirectTo} embedded />
            </Suspense>
          ) : null}
        </div>
      </div>
    </SignInCanvasProvider>
  );
}

function CapturedCard() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <RiCheckLine className="size-8" aria-hidden="true" />
    </div>
  );
}

const CONCEPT_ICONS: Partial<Record<GuideArtName, IconType>> = {
  voucher: RiHandCoinLine,
  offer: RiStore2Line,
  pool: RiGroupLine,
  send: RiSendPlane2Line,
  receive: RiQrCodeLine,
  wallet: RiWallet3Line,
};

function ConceptGrid() {
  const { i18n } = useLingui();
  const [intro, ...concepts] = introductionSlides;
  if (!intro) return null;

  return (
    <div className="flex flex-col">
      <h1 className="max-w-[18ch] font-heading text-[1.75rem] font-bold leading-tight">
        {i18n._(intro.title)}
      </h1>
      <p className="mt-3 max-w-[56ch] text-sm text-muted-foreground">{i18n._(intro.body)}</p>
      <div className="mt-8 grid grid-cols-3 gap-3">
        {concepts.map((concept) => {
          const Icon = CONCEPT_ICONS[concept.art];
          return (
            <div key={concept.art} className="border border-border bg-card p-4">
              {Icon ? <Icon className="size-5 text-primary" aria-hidden="true" /> : null}
              <h2 className="mt-3 font-heading text-sm font-semibold">{i18n._(concept.title)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{i18n._(concept.body)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WelcomeActions({ redirectTo }: { redirectTo?: string }) {
  const navigate = useNavigate();

  function go(next: "profile" | "signin") {
    completeIntroduction();
    void navigate({ to: "/onboarding", search: onboardingSearch(next, redirectTo) });
  }

  return (
    <div className="flex flex-col gap-3">
      <Button className="w-full" onClick={() => go("profile")}>
        <Trans>Create account</Trans>
      </Button>
      <Button variant="outline" className="w-full" onClick={() => go("signin")}>
        <Trans>I already have an account</Trans>
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="ghost"
          className="min-w-0"
          onClick={() => {
            completeIntroduction();
            void navigate({ to: "/" });
          }}
        >
          <RiStore2Line className="size-4" aria-hidden="true" />
          <Trans>Market</Trans>
        </Button>
        <InstallAppButton quiet />
      </div>
    </div>
  );
}

function SignInColumn({ redirectTo }: { redirectTo?: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <OnboardingTitle>
        <Trans>Welcome back</Trans>
      </OnboardingTitle>
      <SignInPanel
        embedded
        redirectTo={redirectTo}
        onAuthenticated={() => {}}
        createAccountStep="profile"
      />
    </div>
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
