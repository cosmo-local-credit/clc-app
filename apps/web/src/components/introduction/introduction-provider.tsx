import { useLingui } from "@lingui/react/macro";
import { RiBookOpenLine } from "react-icons/ri";
import { useRouterState } from "@tanstack/react-router";
import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ActionRow } from "#/components/ui/action-row";
import { LandingPage } from "#/features/onboarding/ui/landing-page";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import {
  completeIntroduction,
  hasSeenIntroduction,
  isIntroductionEntry,
  INTRODUCTION_STORAGE_KEY,
} from "./introduction-state";

const Introduction = lazy(() =>
  import("./introduction").then((module) => ({ default: module.Introduction })),
);
const ReplayContext = createContext<(() => void) | null>(null);
const FirstVisitContext = createContext({ show: false, complete: completeIntroduction });

export function IntroductionProvider({
  children,
  suppressed = false,
}: {
  children: ReactNode;
  suppressed?: boolean;
}) {
  const auth = useAuthStatus();
  const location = useRouterState({ select: (state) => state.location });
  const [seen, setSeen] = useState<boolean | null>(null);
  const [replay, setReplay] = useState(false);
  useEffect(() => {
    function refresh() {
      const completed = hasSeenIntroduction();
      if (completed) completeIntroduction();
      setSeen(completed);
    }
    function onStorage(event: StorageEvent) {
      if (event.key === INTRODUCTION_STORAGE_KEY) refresh();
    }
    refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  useEffect(() => {
    // Existing wallet holders should not be treated as new members after sign-out.
    if (auth.address || auth.isAuthenticated) {
      completeIntroduction();
      setSeen(true);
    }
  }, [auth.address, auth.isAuthenticated]);
  const entry = isIntroductionEntry(location.pathname, location.search, location.hash);
  const waiting = !suppressed && !replay && entry && (seen === null || auth.isLoading);
  const show = !suppressed && (replay || (entry && auth.state === "guest" && seen === false));

  function complete() {
    completeIntroduction();
    setSeen(true);
    setReplay(false);
  }

  return (
    <FirstVisitContext.Provider
      value={{
        show:
          !suppressed &&
          !auth.isLoading &&
          auth.state === "guest" &&
          !auth.address &&
          seen === false,
        complete,
      }}
    >
      <ReplayContext.Provider value={() => setReplay(true)}>
        {waiting ? (
          <div className="min-h-[100svh] bg-background" aria-busy="true" />
        ) : show ? (
          <Suspense fallback={<div className="min-h-[100svh] bg-background" />}>
            {replay ? (
              <Introduction replay onExit={complete} />
            ) : (
              <LandingPage
                onComplete={complete}
                redirectTo={
                  typeof location.search.redirect === "string"
                    ? location.search.redirect
                    : undefined
                }
              />
            )}
          </Suspense>
        ) : (
          children
        )}
      </ReplayContext.Provider>
    </FirstVisitContext.Provider>
  );
}

/** Locked pages share welcome's completion state and action. */
export function useFirstVisitIntroduction() {
  return useContext(FirstVisitContext);
}

export function IntroductionReplayButton() {
  const { t } = useLingui();
  const replay = useContext(ReplayContext);
  if (!replay) return null;
  return (
    <ActionRow
      icon={<RiBookOpenLine className="size-4" aria-hidden="true" />}
      label={t({ id: "intro.replay", message: "How to use CLC" })}
      onClick={replay}
    />
  );
}
