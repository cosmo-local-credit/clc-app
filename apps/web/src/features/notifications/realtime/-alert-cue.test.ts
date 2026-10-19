import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useNotificationCues } from "../state/cue-preferences";
import {
  playNotificationCue,
  primeNotificationCue,
  resetNotificationCueForTests,
} from "./alert-cue";

type GainCall = { method: string; value: number; time: number };

class FakeAudioContext {
  static latest: FakeAudioContext | undefined;
  static resume = vi.fn(async (audio: FakeAudioContext) => {
    audio.state = "running";
  });

  state: AudioContextState = "suspended";
  currentTime = 1;
  destination = {};
  resume = () => FakeAudioContext.resume(this);
  oscillators: Array<{ frequency: number; started: number; stopped: number }> = [];
  gains: GainCall[][] = [];

  constructor() {
    FakeAudioContext.latest = this;
  }

  createOscillator() {
    const row = { frequency: 0, started: 0, stopped: 0 };
    this.oscillators.push(row);
    return {
      type: "sine",
      frequency: {
        set value(next: number) {
          row.frequency = next;
        },
        get value() {
          return row.frequency;
        },
      },
      connect() {},
      start(when: number) {
        row.started = when;
      },
      stop(when: number) {
        row.stopped = when;
      },
    };
  }

  createGain() {
    const calls: GainCall[] = [];
    this.gains.push(calls);
    return {
      gain: {
        setValueAtTime(value: number, time: number) {
          calls.push({ method: "set", value, time });
        },
        exponentialRampToValueAtTime(value: number, time: number) {
          calls.push({ method: "ramp", value, time });
        },
      },
      connect() {},
    };
  }
}

function context(): FakeAudioContext {
  const latest = FakeAudioContext.latest;
  if (!latest) throw new Error("AudioContext was not created.");
  return latest;
}

let vibrate = vi.fn();

function gesture(type: "pointerdown" | "pointerup", pointerType = "mouse") {
  window.dispatchEvent(new PointerEvent(type, { pointerType, bubbles: true }));
}

beforeEach(() => {
  resetNotificationCueForTests();
  FakeAudioContext.latest = undefined;
  FakeAudioContext.resume.mockReset();
  FakeAudioContext.resume.mockImplementation(async (audio) => {
    audio.state = "running";
  });
  vi.stubGlobal("AudioContext", FakeAudioContext);
  useNotificationCues.setState({ sound: true, vibration: true });
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  Object.defineProperty(navigator, "userActivation", {
    configurable: true,
    value: { hasBeenActive: true },
  });
  vibrate = vi.fn(function (this: Navigator) {
    if (this !== navigator) throw new TypeError("Illegal invocation");
    return true;
  });
  Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
  Object.defineProperty(navigator, "audioSession", {
    configurable: true,
    value: { type: "auto" },
  });
});

afterEach(() => {
  resetNotificationCueForTests();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "vibrate");
  Reflect.deleteProperty(navigator, "userActivation");
  Reflect.deleteProperty(navigator, "audioSession");
  vi.restoreAllMocks();
});

describe("primeNotificationCue", () => {
  it("ignores a touch pointerdown and resumes on pointerup", async () => {
    primeNotificationCue();
    gesture("pointerdown", "touch");
    expect(FakeAudioContext.latest).toBeUndefined();

    gesture("pointerup", "touch");
    await vi.waitFor(() => expect(FakeAudioContext.resume).toHaveBeenCalledOnce());
    expect((navigator as Navigator & { audioSession: { type: string } }).audioSession.type).toBe(
      "transient",
    );
  });

  it("keeps listening until the context is running, then listens again after it suspends", async () => {
    FakeAudioContext.resume.mockImplementation(async () => undefined);
    primeNotificationCue();
    gesture("pointerup");
    gesture("pointerup");
    expect(FakeAudioContext.resume).toHaveBeenCalledTimes(2);

    FakeAudioContext.resume.mockImplementation(async (audio) => {
      audio.state = "running";
    });
    gesture("pointerup");
    await vi.waitFor(() => expect(context().state).toBe("running"));
    const calls = FakeAudioContext.resume.mock.calls.length;
    gesture("pointerup");
    expect(FakeAudioContext.resume).toHaveBeenCalledTimes(calls);

    context().state = "suspended";
    document.dispatchEvent(new Event("visibilitychange"));
    gesture("pointerup");
    expect(FakeAudioContext.resume.mock.calls.length).toBe(calls + 1);
  });
});

describe("playNotificationCue", () => {
  it("still plays sound when vibration throws", async () => {
    vibrate.mockImplementation(() => {
      throw new Error("Vibration unavailable");
    });
    primeNotificationCue();
    gesture("pointerup");
    await vi.waitFor(() => expect(context().state).toBe("running"));

    expect(() => playNotificationCue()).not.toThrow();
    expect(context().oscillators.map((row) => row.frequency)).toEqual([784, 1046.5]);
  });

  it("vibrates only after activation, stays quiet when hidden or muted, and collapses a burst", async () => {
    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { hasBeenActive: false },
    });
    playNotificationCue();
    expect(vibrate).not.toHaveBeenCalled();

    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { hasBeenActive: true },
    });
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    playNotificationCue();
    expect(vibrate).not.toHaveBeenCalled();

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    useNotificationCues.setState({ sound: false, vibration: false });
    playNotificationCue();
    expect(vibrate).not.toHaveBeenCalled();

    useNotificationCues.setState({ sound: true, vibration: true });
    primeNotificationCue();
    gesture("pointerup");
    await vi.waitFor(() => expect(context().state).toBe("running"));
    playNotificationCue();
    playNotificationCue();
    expect(vibrate).toHaveBeenCalledOnce();
    expect(vibrate).toHaveBeenCalledWith([30, 60, 30]);
    expect(context().oscillators.map((row) => row.frequency)).toEqual([784, 1046.5]);
    expect(context().oscillators[0]).toMatchObject({ started: 1, stopped: 1.09 });
    expect(context().oscillators[1]).toMatchObject({ started: 1.07, stopped: 1.23 });
    expect(context().gains[0]).toEqual([
      { method: "set", value: 0.0001, time: 1 },
      { method: "ramp", value: 0.15, time: 1.008 },
      { method: "ramp", value: 0.0001, time: 1.09 },
    ]);
  });
});
