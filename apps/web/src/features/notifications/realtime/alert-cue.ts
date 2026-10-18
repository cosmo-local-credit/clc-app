import { useNotificationCues } from "../state/cue-preferences";

const BURST_MS = 1500;
const ATTACK_S = 0.008;
const PEAK_GAIN = 0.15;

let audio: AudioContext | undefined;
let listening = false;
let watchingVisibility = false;
let lastPlayedAt = 0;

const primeEvents = ["pointerdown", "pointerup", "touchend", "keydown"] as const;

function onPrimeEvent(event: Event): void {
  // A touch pointerdown is not an activation. pointerup and touchend are.
  if (
    event.type === "pointerdown" &&
    event instanceof PointerEvent &&
    event.pointerType === "touch"
  ) {
    return;
  }
  armAudio();
}

function addPrimeListeners(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  for (const type of primeEvents) {
    window.addEventListener(type, onPrimeEvent, { capture: true, passive: true });
  }
}

function removePrimeListeners(): void {
  if (!listening || typeof window === "undefined") return;
  listening = false;
  for (const type of primeEvents) {
    window.removeEventListener(type, onPrimeEvent, { capture: true });
  }
}

function onVisible(): void {
  // iOS suspends the context in the background. The next gesture has to resume it.
  if (document.visibilityState === "visible" && audio?.state !== "running") addPrimeListeners();
}

function armAudio(): void {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "transient";
    const Context = window.AudioContext;
    if (!Context) return;
    audio ??= new Context();
    void audio.resume().then(
      () => {
        if (audio?.state === "running") removePrimeListeners();
      },
      () => undefined,
    );
  } catch {
    // A blocked audio API leaves the cue silent.
  }
}

/** Prepares audio. Call once when a wallet session starts. */
export function primeNotificationCue(): void {
  if (typeof window === "undefined") return;
  void useNotificationCues.persist.rehydrate();
  addPrimeListeners();
  if (!watchingVisibility) {
    watchingVisibility = true;
    document.addEventListener("visibilitychange", onVisible);
  }
}

function chime(context: AudioContext, frequency: number, start: number, duration: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, start + ATTACK_S);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

/** Plays the cue. Never throws. A hidden page and a burst of payments stay quiet. */
export function playNotificationCue(): void {
  try {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const preferences = useNotificationCues.getState();
    const nav = navigator as Navigator & {
      userActivation?: { hasBeenActive?: boolean };
      vibrate?: (pattern: number[]) => boolean;
    };
    const vibrate =
      preferences.vibration && nav.userActivation?.hasBeenActive === true && nav.vibrate
        ? nav.vibrate
        : undefined;
    const context = preferences.sound && audio?.state === "running" ? audio : undefined;
    if (!vibrate && !context) return;
    const now = Date.now();
    if (now - lastPlayedAt < BURST_MS) return;
    lastPlayedAt = now;
    vibrate?.([30, 60, 30]);
    if (context) {
      const start = context.currentTime;
      chime(context, 784, start, 0.09);
      chime(context, 1046.5, start + 0.07, 0.16);
    }
  } catch {
    // The cue is optional. A thrown Web Audio call must not block the toast.
  }
}

export function resetNotificationCueForTests(): void {
  removePrimeListeners();
  if (watchingVisibility && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", onVisible);
  }
  watchingVisibility = false;
  audio = undefined;
  lastPlayedAt = 0;
}
