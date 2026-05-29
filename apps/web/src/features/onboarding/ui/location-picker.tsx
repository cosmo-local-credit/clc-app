import type { LocationInput } from "@clc/core/features/location/logic";
import { locationSchema } from "@clc/core/features/location/logic";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ImSpinner2 } from "react-icons/im";
import { TbCurrentLocation } from "react-icons/tb";

import { Input } from "#/components/ui/input";
import type { GeocodeSuggestion } from "#/features/onboarding/api/geo-client";
import {
	reverseLocation,
	searchLocations,
} from "#/features/onboarding/api/geo-client";

import { LocationMap } from "./location-map.lazy";
import { useBrowserGeolocation } from "./use-browser-geolocation";

type LocationPickerProps = {
	value: LocationInput | undefined;
	onChange: (value: LocationInput | undefined) => void;
	error?: string;
};

type PlacePinOptions = {
	locationNameHint?: string;
	clearSuggestions?: boolean;
	updateSearchInput?: boolean;
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
	const skipNextSearchRef = useRef(false);
	const geolocation = useBrowserGeolocation();

	useEffect(() => {
		setPin(value ? { lat: value.lat, lng: value.lng } : null);
	}, [value]);

	const setSearchQueryFromLocation = useCallback((nextQuery: string) => {
		skipNextSearchRef.current = true;
		setQuery(nextQuery);
	}, []);

	const placePin = useCallback(
		(lat: number, lng: number, options: PlacePinOptions = {}) => {
			setPin({ lat, lng });
			if (options.clearSuggestions !== false) {
				setSuggestions([]);
			}
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
					locationName: options.locationNameHint ?? result.locationName,
					country: result.country,
				});
				if (!parsed.success) {
					setReverseError(REVERSE_ERROR);
					onChange(undefined);
					return;
				}

				setReverseError(null);
				if (options.updateSearchInput !== false) {
					setSearchQueryFromLocation(parsed.data.locationName);
				}
				onChange(parsed.data);
			});
		},
		[onChange, setSearchQueryFromLocation],
	);

	useEffect(() => {
		searchAbortRef.current?.abort();
		if (skipNextSearchRef.current) {
			skipNextSearchRef.current = false;
			setSuggestions([]);
			setSearching(false);
			return;
		}

		const trimmedQuery = query.trim();
		if (trimmedQuery.length < 3) {
			setSuggestions([]);
			setSearching(false);
			return;
		}

		setSearching(true);
		const controller = new AbortController();
		searchAbortRef.current = controller;
		const timeout = setTimeout(() => {
			void searchLocations(trimmedQuery, controller.signal).then((results) => {
				if (controller.signal.aborted) return;
				setSuggestions(results.slice(0, 4));
				setSearching(false);
			});
		}, 400);

		return () => {
			controller.abort();
			clearTimeout(timeout);
		};
	}, [query]);

	useEffect(() => {
		return () => {
			searchAbortRef.current?.abort();
			reverseAbortRef.current?.abort();
		};
	}, []);

	useEffect(() => {
		if (geolocation.state.status === "granted") {
			placePin(geolocation.state.lat, geolocation.state.lng);
		}
	}, [geolocation.state, placePin]);

	const geoUnavailable =
		geolocation.state.status === "denied" ||
		geolocation.state.status === "unavailable";
	const geoRequesting = geolocation.state.status === "requesting";
	const shownError = reverseError ?? (reversePending ? undefined : error);

	return (
		<div className="space-y-3">
			<div className="relative">
				<label htmlFor="location-search" className="text-sm font-medium">
					Location
				</label>
				<div className="relative mt-1.5">
					<Input
						id="location-search"
						type="text"
						role="searchbox"
						autoComplete="off"
						placeholder="Search for a town or place"
						value={query}
						onChange={(event) => {
							skipNextSearchRef.current = false;
							setQuery(event.target.value);
						}}
						className="bg-card pr-10"
						aria-invalid={!!shownError}
					/>
					<button
						type="button"
						className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground"
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
									setSearchQueryFromLocation(suggestion.address);
									placePin(suggestion.lat, suggestion.lng, {
										locationNameHint: suggestion.address,
									});
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

			<Suspense
				fallback={
					<output className="block h-52 w-full rounded-xl border border-border bg-card">
						<span className="sr-only">Loading location map</span>
					</output>
				}
			>
				<LocationMap
					lat={pin?.lat ?? null}
					lng={pin?.lng ?? null}
					interactive
					onLocationChange={placePin}
				/>
			</Suspense>

			{reversePending ? (
				<output className="text-sm text-muted-foreground">
					Identifying location…
				</output>
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
