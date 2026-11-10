import type { ProfileInput } from "@clc/core/features/signup/logic";
import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { type SetupStep, useOnboardingFlow } from "#/features/onboarding/hooks/use-onboarding-flow";
import type { OnboardingProfileDraft } from "#/features/onboarding/hooks/use-onboarding-profile";
import { OnboardingSessionProvider } from "./onboarding-session";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("#/features/webauthn/hooks/use-platform-passkey-label", () => ({
  isPasskeyPlatformAvailable: () => false,
}));

const PROFILE: ProfileInput = {
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "",
  preferredCurrency: "KES",
  bio: "",
  website: "",
  location: { lat: -1.29, lng: 36.82, locationName: "Nairobi", country: "KE" },
};
const PHOTO = new File([new Uint8Array(4)], "me.jpg", { type: "image/jpeg" });

type Flow = ReturnType<typeof useOnboardingFlow>;

/** Stands in for the phone flow or the desktop setup: both are a view over useOnboardingFlow. */
function View({ step, onFlow }: { step: SetupStep; onFlow: (flow: Flow) => void }) {
  const flow = useOnboardingFlow({ step });
  useEffect(() => onFlow(flow));
  return null;
}

function renderSwitch(step: SetupStep) {
  let flow!: Flow;
  const capture = (next: Flow) => {
    flow = next;
  };
  const tree = (view: "phone" | "desk") => (
    <OnboardingSessionProvider step={step}>
      {/* A different key per view is what the layout switch does: one unmounts, the other mounts. */}
      <View key={view} step={step} onFlow={capture} />
    </OnboardingSessionProvider>
  );
  const utils = render(tree("phone"));
  return {
    flow: () => flow,
    switchTo: (view: "phone" | "desk") => utils.rerender(tree(view)),
    rerenderAt: (next: SetupStep, view: "phone" | "desk") =>
      utils.rerender(
        <OnboardingSessionProvider step={next}>
          <View key={view} step={next} onFlow={capture} />
        </OnboardingSessionProvider>,
      ),
  };
}

describe("onboarding session across a layout switch", () => {
  it("keeps the submitted profile and the one paper-wallet key", () => {
    const view = renderSwitch("card");
    act(() => view.flow().profile.onNext(PROFILE, PHOTO));
    view.rerenderAt("card", "phone");
    const before = view.flow().wallet;
    expect(before?.privateKey).toMatch(/^0x[0-9a-f]{64}$/);

    act(() => before?.onBackendRegistered());
    view.rerenderAt("card", "desk");

    const after = view.flow().wallet;
    expect(after?.profileData).toEqual(PROFILE);
    expect(after?.avatarFile).toBe(PHOTO);
    expect(after?.privateKey).toBe(before?.privateKey);
    expect(after?.backendRegistered).toBe(true);
  });

  it("hands the other view the profile as typed so far", () => {
    const view = renderSwitch("contact");
    const draft: OnboardingProfileDraft = {
      values: { ...PROFILE, location: undefined, username: "" },
      avatarFile: PHOTO,
      currencyChosen: true,
      currencySuggestedByLocation: false,
      suggestedCountry: "KE",
      suggestedUsername: "",
    };
    act(() => view.flow().profile.onDraft(draft));
    view.switchTo("desk");
    expect(view.flow().profile.restored).toEqual(draft);
  });

  it("starts over when signup is left for the welcome screen", () => {
    const view = renderSwitch("card");
    act(() => view.flow().profile.onNext(PROFILE, PHOTO));
    view.rerenderAt("card", "phone");
    const key = view.flow().wallet?.privateKey;

    act(() => view.rerenderAt("welcome" as SetupStep, "phone"));
    view.rerenderAt("profile", "phone");
    expect(view.flow().wallet).toBeNull();
    expect(view.flow().profile.initialValues).toBeUndefined();
    act(() => view.flow().profile.onNext(PROFILE, PHOTO));
    view.rerenderAt("card", "phone");
    expect(view.flow().wallet?.privateKey).not.toBe(key);
  });
});
