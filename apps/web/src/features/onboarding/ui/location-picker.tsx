import type { LocationInput } from "@clc/core/features/location/logic";
import { locationSchema } from "@clc/core/features/location/logic";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImSpinner2 } from "react-icons/im";
import { TbCurrentLocation } from "react-icons/tb";

import { Input } from "#/components/ui/input";
import type { GeocodeSuggestion } from "#/features/onboarding/api/geo-client";
import {
	reverseLocation,
	searchLocations,
} from "#/features/onboarding/api/geo-client";

import { LocationMap } from "./location-map";
import { useBrowserGeolocation } from "./use-browser-geolocation";

type LocationPickerProps = {
	value: LocationInput | undefined;
	onChange: (value: LocationInput | undefined) => void;
	error?: string;
};

const REVERSE_ERROR = "Couldn't identify a country here. Try a nearby spot.";

export function LocationPicker({
	value,
	onChange,
	error,
}: LocationPickerProps) {
	const [query, setQuery] = useState("");
	const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
	const [searching, setSearching] = useState(false);
	const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
		value ? { lat: value.lat, lng: value.lng } : null,
	);
	const [reversePending, setReversePending] = useState(false);
	const [reverseError, setReverseError] = useState<string | null>(null);
	const searchAbortRef = useRef<AbortController | null>(null);
	const reverseAbortRef = useRef<AbortController | null>(null);
	const reverseRequestRef = useRef(0);
	const geolocation = useBrowserGeolocation();

	useEffect(() => {
		if (value) {
			setPin({ lat: value.lat, lng: value.lng });
		}
	}, [value]);

	useEffect(() => {
		if (query.trim().length < 3) {
			searchAbortRef.current?.abort();
			setSuggestions([]);
			setSearching(false);
			return;
		}

		setSearching(true);
		const timeout = setTimeout(() => {
			searchAbortRef.current?.abort();
			const controller = new AbortController();
			searchAbortRef.current = controller;
			void searchLocations(query.trim(), controller.signal).then((results) => {
				if (controller.signal.aborted) return;
				setSuggestions(results.slice(0, 5));
				setSearching(false);
			});
		}, 400);

		return () => {
			clearTimeout(timeout);
		};
	}, [query]);

	useEffect(() => {
		return () => {
			searchAbortRef.current?.abort();
			reverseAbortRef.current?.abort();
		};
	}, []);

	const placePin = useCallback(
		(lat: number, lng: number) => {
			setPin({ lat, lng });
			setSuggestions([]);
			setReverseError(null);
			setReversePending(true);
			onChange(undefined);

			reverseAbortRef.current?.abort();
			const controller = new AbortController();
			reverseAbortRef.current = controller;
			const requestId = reverseRequestRef.current + 1;
			reverseRequestRef.current = requestId;

			void reverseLocation(lat, lng, controller.signal).then((result) => {
				if (
					controller.signal.aborted ||
					reverseRequestRef.current !== requestId
				) {
					return;
				}
				setReversePending(false);
				if (!result) {
					setReverseError(REVERSE_ERROR);
					onChange(undefined);
					return;
				}

				const parsed = locationSchema.safeParse({
					lat,
					lng,
					locationName: result.locationName,
					country: result.country,
				});
				if (!parsed.success) {
					setReverseError(REVERSE_ERROR);
					onChange(undefined);
					return;
				}

				setReverseError(null);
				onChange(parsed.data);
			});
		},
		[onChange],
	);

	useEffect(() => {
		if (geolocation.state.status === "granted") {
			placePin(geolocation.state.lat, geolocation.state.lng);
		}
	}, [geolocation.state, placePin]);

	const geoUnavailable =
		geolocation.state.status === "denied" ||
		geolocation.state.status === "unavailable";
	const geoRequesting = geolocation.state.status === "requesting";
	const placeLabel = value?.locationName;
	const shownError = reverseError ?? error;

	return (
		<div className="space-y-3">
			<div className="relative">
				<label htmlFor="location-search" className="text-sm font-medium">
					Location
				</label>
				<div className="relative mt-1.5">
					<Input
						id="location-search"
						type="search"
						role="searchbox"
						autoComplete="off"
						placeholder="Search for a town or place"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						className="bg-card pr-10"
						aria-invalid={!!shownError}
						aria-label="Place search"
					/>
					<button
						type="button"
						className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center text-muted-foreground disabled:pointer-events-none disabled:opacity-50"
						onClick={geolocation.request}
						disabled={geoUnavailable || geoRequesting}
						aria-label={
							geoUnavailable ? "Location unavailable" : "Use my location"
						}
					>
						{geoRequesting ? (
							<ImSpinner2 className="size-4 animate-spin" />
						) : (
							<TbCurrentLocation className="size-4" />
						)}
					</button>
				</div>

				{suggestions.length > 0 ? (
					<div
						role="listbox"
						className="absolute z-50 mt-1 w-full rounded-none border border-border bg-card"
					>
						{suggestions.map((suggestion) => (
							<button
								key={`${suggestion.address}-${suggestion.lat}-${suggestion.lng}`}
								type="button"
								role="option"
								aria-selected="false"
								className="block w-full px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
								onClick={() => {
									setQuery(suggestion.address);
									placePin(suggestion.lat, suggestion.lng);
								}}
							>
								{suggestion.address}
							</button>
						))}
					</div>
				) : null}
			</div>

			{searching ? (
				<p className="text-xs text-muted-foreground">Searching places…</p>
			) : null}

			<LocationMap
				lat={pin?.lat ?? null}
				lng={pin?.lng ?? null}
				interactive
				onLocationChange={placePin}
			/>

			{reversePending ? (
				<output className="text-sm text-muted-foreground">
					Identifying location…
				</output>
			) : placeLabel ? (
				<p className="rounded-xl border border-border bg-card p-3 text-sm">
					{placeLabel}
				</p>
			) : null}

			{shownError ? (
				<p className="text-xs text-destructive">{shownError}</p>
			) : null}

			{geolocation.state.status === "error" ? (
				<p className="text-xs text-destructive">{geolocation.state.message}</p>
			) : null}
		</div>
	);
}
