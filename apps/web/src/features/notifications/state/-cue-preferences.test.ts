import { beforeEach, describe, expect, it } from "vite-plus/test";
import { useNotificationCues } from "./cue-preferences";

beforeEach(() => {
  localStorage.clear();
  useNotificationCues.persist.clearStorage();
  useNotificationCues.setState({ sound: true, vibration: true });
});

describe("notification cue preferences", () => {
  it("defaults to on and persists a change", async () => {
    expect(useNotificationCues.getState()).toMatchObject({ sound: true, vibration: true });

    useNotificationCues.getState().setSound(false);
    const stored = localStorage.getItem("clc.notification-cues");
    expect(stored).toContain('"sound":false');

    useNotificationCues.setState({ sound: true, vibration: true });
    localStorage.setItem("clc.notification-cues", stored ?? "");
    await useNotificationCues.persist.rehydrate();

    expect(useNotificationCues.getState().sound).toBe(false);
    expect(useNotificationCues.getState().vibration).toBe(true);
  });
});
