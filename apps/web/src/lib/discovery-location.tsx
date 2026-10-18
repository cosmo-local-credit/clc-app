import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useBrowserGeolocation } from "#/lib/use-browser-geolocation";
import { useIPCamera } from "#/features/home/hooks/use-ip-camera";
import {
  readPersistedLocation,
  writePersistedLocation,
  type PersistedLocation,
} from "#/features/home/api/last-location-storage";

/** Reset location on owner changes without remounting the route or its forms. */
export function DiscoveryLocationProvider({
  owner,
  children,
}: {
  owner: string;
  children: ReactNode;
}) {
  const store = useMemo(() => createLocationStore(owner), [owner]);
  return (
    <LocationContext.Provider value={store}>
      <LocationController key={owner} owner={owner} store={store} />
      {children}
    </LocationContext.Provider>
  );
}

type LocationSnapshot = ReturnType<typeof useLocationState>;
function createLocationStore(owner: string) {
  return createStore<LocationSnapshot & { requestCount: number }>((set) => ({
    owner,
    realFix: null,
    liveFix: null,
    origin: null,
    ip: undefined,
    ipPending: true,
    locationStatus: "idle",
    explicitRequests: 0,
    requestCount: 0,
    // An action can arrive before controller effects. Keep it queued in memory.
    requestLocation: () => set((state) => ({ requestCount: state.requestCount + 1 })),
  }));
}
type LocationStore = ReturnType<typeof createLocationStore>;
const LocationContext = createContext<LocationStore | null>(null);
function LocationController({ owner, store }: { owner: string; store: LocationStore }) {
  const snapshot = useLocationState(owner);
  const requestCount = useStore(store, (state) => state.requestCount);
  const { requestLocation } = snapshot;
  useEffect(() => {
    store.setState({ ...snapshot, requestLocation: store.getState().requestLocation });
  }, [store, snapshot]);
  useEffect(() => {
    if (requestCount > 0) requestLocation();
  }, [requestCount, requestLocation]);
  return null;
}

function useLocationState(owner: string) {
  const { state, request } = useBrowserGeolocation({ autoRequestIfGranted: owner !== "pending" });
  const ipQuery = useIPCamera();
  const [persisted, setPersisted] = useState<PersistedLocation | null>(null);
  const [liveFix, setLiveFix] = useState<Extract<typeof state, { status: "granted" }> | null>(null);
  const [explicitRequests, setExplicitRequests] = useState(0);
  useEffect(() => {
    setPersisted(readPersistedLocation(owner));
  }, [owner]);
  useEffect(() => {
    if (state.status !== "granted") return;
    setLiveFix(state);
    if (owner === "pending") return;
    writePersistedLocation({
      owner,
      lat: state.lat,
      lng: state.lng,
      accuracy: state.accuracy,
      capturedAt: new Date().toISOString(),
    });
  }, [state, owner]);
  const requestLocation = useCallback(() => {
    setExplicitRequests((count) => count + 1);
    request();
  }, [request]);
  // Keep the last fix while refreshing, including when storage is blocked.
  const realFix = useMemo(() => {
    const fix = liveFix ?? persisted;
    return fix ? { lat: fix.lat, lng: fix.lng } : null;
  }, [liveFix, persisted]);
  const ip = ipQuery.data;
  const origin = realFix ?? (ip?.source === "ip-city" ? ip : null);
  return useMemo(
    () => ({
      owner,
      realFix,
      liveFix,
      origin,
      ip,
      ipPending: ipQuery.isPending,
      locationStatus: state.status,
      requestLocation,
      explicitRequests,
    }),
    [
      owner,
      realFix,
      liveFix,
      origin,
      ip,
      ipQuery.isPending,
      state.status,
      requestLocation,
      explicitRequests,
    ],
  );
}
export function useDiscoveryLocation(owner: string) {
  const store = useContext(LocationContext);
  if (!store) throw new Error("DiscoveryLocationProvider is required");
  const value = useStore(store);
  return value.owner === owner ? value : { ...value, realFix: null, liveFix: null, origin: null };
}
