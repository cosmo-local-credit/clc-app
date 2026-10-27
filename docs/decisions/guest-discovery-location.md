# Viewport discovery and guest camera hints

Accepted 2026-10-25. This supersedes fixed-radius discovery.

Marketplace visibility is the exact rectangle last settled on the Marketplace
map. Lists use that owner-scoped rectangle after it exists and remain Global
before the map establishes one. Map marker requests use a padded envelope for
smooth nearby panning, while list and search requests keep the exact visible
bounds.

## Camera bootstrap

Camera sources resolve by confidence rather than arrival order:

1. An explicit current-location request.
2. A selected resource deep link.
3. The wallet or guest's saved map viewport.
4. A signed-in profile location.
5. A live or recent owner-scoped GPS fix.
6. IP city.
7. A world camera with Global results when no IP city resolves.

Only an already granted permission may fetch GPS automatically. An IP city never
becomes a real location, profile value, distance origin, or "you are here"
marker. Browser and manually selected interface languages are not used to
position the map.

The same inferred camera centres an empty `LocationPicker`, including onboarding,
without placing a pin or changing the form value. A person still has to search,
tap the map, or press **Use my location**. A late hint cannot move a picker after
the person begins browsing it.

## Ownership and persistence

`DiscoveryLocationProvider` owns one device request stream and approximate-camera
query. Precise fixes and settled viewports are scoped to the lowercased wallet or
guest storage tier. Owner changes clear in-memory state immediately, and sign-out
removes the signed-in viewport without copying it to the guest tier.

MapLibre reports `moveend` only after gesture inertia. The app debounces that
settlement, canonicalizes antimeridian bounds, ignores equivalent rectangles,
and persists only settled camera state. Filter and search changes never fit or
move the camera.

## Requests and caches

Discovery endpoints accept one `bbox=minLng,minLat,maxLng,maxLat`, or two repeated
boxes for an antimeridian viewport. Bounds are part of query keys and opaque
cursor isolation. Query functions pass React Query's `AbortSignal`; a newer
settled viewport cancels obsolete work. Existing markers remain visible while
the replacement request is pending or retryable.

The IP-city lookup is cached for the browser session. Failure is non-blocking and
falls through directly to Global discovery.
