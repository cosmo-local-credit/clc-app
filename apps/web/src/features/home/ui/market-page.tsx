import { Suspense, useCallback, useMemo, useState } from "react";
import {
	RiArrowRightSLine,
	RiFocus3Line,
	RiListUnordered,
	RiMapPinLine,
} from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { useBrowserGeolocation } from "#/lib/use-browser-geolocation";
import { type MarketLocation, placeholderMarketLocations } from "./market-data";
import { MarketMap } from "./market-map.lazy";

export function MarketPage() {
	const geolocation = useBrowserGeolocation();
	const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
		placeholderMarketLocations[0]?.id ?? null,
	);
	const selectedLocation = useMemo(
		() =>
			placeholderMarketLocations.find(
				(location) => location.id === selectedLocationId,
			) ?? null,
		[selectedLocationId],
	);
	const userLocation =
		geolocation.state.status === "granted"
			? { lat: geolocation.state.lat, lng: geolocation.state.lng }
			: null;
	const locationButtonLabel =
		geolocation.state.status === "requesting"
			? "Finding location"
			: geolocation.state.status === "denied"
				? "Location denied"
				: geolocation.state.status === "unavailable"
					? "Location unavailable"
					: "Use current location";

	const handleSelectLocation = useCallback((id: string) => {
		setSelectedLocationId(id);
	}, []);

	return (
		<main className="relative h-[100svh] overflow-hidden bg-card">
			<Suspense
				fallback={
					<div className="market-map-fallback absolute inset-0 h-full w-full bg-card" />
				}
			>
				<MarketMap
					locations={placeholderMarketLocations}
					selectedLocationId={selectedLocationId}
					userLocation={userLocation}
					onSelectLocation={handleSelectLocation}
					className="absolute inset-0 h-full w-full"
				/>
			</Suspense>

			{selectedLocation ? <MarketPreview location={selectedLocation} /> : null}

			<div className="absolute right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20 flex">
				<Button
					size="icon-lg"
					className="h-11 w-11 bg-foreground text-background hover:bg-foreground/90 disabled:bg-foreground disabled:text-background/70"
					aria-label={locationButtonLabel}
					disabled={
						geolocation.state.status === "requesting" ||
						geolocation.state.status === "denied" ||
						geolocation.state.status === "unavailable"
					}
					onClick={geolocation.request}
				>
					<RiFocus3Line className="size-5" aria-hidden="true" />
				</Button>
			</div>

			<div className="absolute inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-6">
				<Button className="h-11 px-5">
					<RiListUnordered className="mr-2 size-4" aria-hidden="true" />
					Browse all
				</Button>
			</div>
		</main>
	);
}

function MarketPreview({ location }: { location: MarketLocation }) {
	return (
		<button
			type="button"
			className="absolute inset-x-4 top-[calc(env(safe-area-inset-top)+1rem)] z-20 flex items-center justify-between gap-3 border border-border bg-card px-4 py-3 text-left"
		>
			<span className="flex min-w-0 items-center gap-2">
				<RiMapPinLine
					className="size-5 shrink-0 text-primary"
					aria-hidden="true"
				/>
				<span className="min-w-0">
					<span className="block truncate font-heading font-semibold text-sm">
						{location.name} · {location.distance}
					</span>
					<span className="mt-1 inline-flex border border-border bg-background px-1.5 py-0.5 font-medium text-[0.6875rem] text-muted-foreground">
						{location.category}
					</span>
				</span>
			</span>
			<RiArrowRightSLine
				className="size-5 shrink-0 text-muted-foreground"
				aria-hidden="true"
			/>
		</button>
	);
}
