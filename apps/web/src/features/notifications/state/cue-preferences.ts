import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type CuePreferences = {
  sound: boolean;
  vibration: boolean;
  setSound: (sound: boolean) => void;
  setVibration: (vibration: boolean) => void;
};

/**
 * Sound and vibration for the in-app cue. Device scoped, so a sign-out keeps
 * them: the next person on this phone inherits the same speaker and motor.
 */
export const useNotificationCues = create<CuePreferences>()(
  persist(
    (set) => ({
      sound: true,
      vibration: true,
      setSound: (sound) => set({ sound }),
      setVibration: (vibration) => set({ vibration }),
    }),
    {
      name: "clc.notification-cues",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // The server has no localStorage. Hydrate after mount so both renders agree.
      skipHydration: true,
    },
  ),
);
