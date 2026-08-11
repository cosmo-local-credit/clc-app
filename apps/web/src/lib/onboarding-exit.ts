import { createFlowExit, type FlowHistory } from "#/lib/navigation/flow-exit";

export type OnboardingRouterHistory = FlowHistory;

/**
 * Onboarding leaves for its destination exactly once, so the exit latch stays
 * set: a late duplicate call (racing auth effects) must not push a second entry.
 */
const onboardingExit = createFlowExit({ reentrant: false });

/** Call while mounted on `/onboarding` so the first entry of this visit is remembered. */
export const noteOnboardingHistoryRoot = onboardingExit.noteRoot;
export const getOnboardingHistoryRootIndex = onboardingExit.getRootIndex;
export const isOnboardingExitInProgress = onboardingExit.isExitInProgress;
/** Test helper — reset global exit latch between cases. */
export const resetOnboardingExitState = onboardingExit.reset;

/** Leave onboarding for `dest`, discarding intermediate and forward onboarding entries. */
export function exitOnboarding(opts: { history: OnboardingRouterHistory; dest: string }): void {
  onboardingExit.exit({ history: opts.history, destination: opts.dest });
}
