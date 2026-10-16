import { Trans } from "@lingui/react/macro";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Button } from "#/components/ui/button";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { onboardingSearch } from "#/lib/onboarding-search";
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

export function IntroductionProvider({
  children,
  suppressed = false,
}: {
  children: ReactNode;
  suppressed?: boolean;
}) {
  const auth = useAuthStatus();
  const navigate = useNavigate();
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

  function exit(action: "skip" | "create" | "signin" | "done") {
    completeIntroduction();
    setSeen(true);
    setReplay(false);
    if (replay) return;
    const redirect =
      "redirect" in location.search && typeof location.search.redirect === "string"
        ? location.search.redirect
        : undefined;
    void navigate({
      to: "/onboarding",
      search: onboardingSearch(
        action === "signin" ? "signin" : action === "create" ? "profile" : "welcome",
        redirect,
      ),
    });
  }

  return (
    <ReplayContext.Provider value={() => setReplay(true)}>
      {waiting ? (
        <div className="min-h-[100svh] bg-background" aria-busy="true" />
      ) : show ? (
        <Suspense fallback={<div className="min-h-[100svh] bg-background" />}>
          <Introduction replay={replay} onExit={exit} />
        </Suspense>
      ) : (
        children
      )}
    </ReplayContext.Provider>
  );
}

export function IntroductionReplayButton() {
  const replay = useContext(ReplayContext);
  if (!replay) return null;
  return (
    <Button variant="outline" className="min-h-11 w-full" onClick={replay}>
      <Trans id="intro.replay">How to use CLC</Trans>
    </Button>
  );
}
