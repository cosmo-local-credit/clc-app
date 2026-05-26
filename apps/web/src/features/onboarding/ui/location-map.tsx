import MapLibreGL, { type MapMouseEvent } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import { cn } from "#/lib/utils";

const NAIROBI = { lat: -1.2921, lng: 36.8219 };
const PIN_ZOOM = 13;
const EMPTY_ZOOM = 5;

type LocationMapProps = {
	lat?: number | null;
	lng?: number | null;
	interactive?: boolean;
	onLocationChange?: (lat: number, lng: number) => void;
	className?: string;
};

function hasWebGlSupport(): boolean {
	const canvas = document.createElement("canvas");
	return !!(
		canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl")
	);
}

export function LocationMap({
	lat,
	lng,
	interactive = false,
	onLocationChange,
	className,
}: LocationMapProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<MapLibreGL.Map | null>(null);
	const markerRef = useRef<MapLibreGL.Marker | null>(null);
	const onLocationChangeRef = useRef(onLocationChange);
	const initialLocationRef = useRef({ lat, lng });
	const interactiveRef = useRef(interactive);
	const pendingRef = useRef<{ lat: number; lng: number } | null>(null);
	const [failed, setFailed] = useState(false);
	const maptilerKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
	const maptilerStyle = maptilerKey
		? `https://api.maptiler.com/maps/base-v4/style.json?key=${encodeURIComponent(maptilerKey)}`
		: null;

	useEffect(() => {
		onLocationChangeRef.current = onLocationChange;
	}, [onLocationChange]);

	useEffect(() => {
		interactiveRef.current = interactive;
	}, [interactive]);

	useEffect(() => {
		if (!maptilerStyle || failed || !containerRef.current || mapRef.current) {
			return;
		}
		if (!hasWebGlSupport()) {
			setFailed(true);
			return;
		}

		const initialLocation = initialLocationRef.current;
		const isInteractive = interactiveRef.current;
		const hasLocation =
			typeof initialLocation.lat === "number" &&
			typeof initialLocation.lng === "number";
		const center: [number, number] = hasLocation
			? [initialLocation.lng as number, initialLocation.lat as number]
			: [NAIROBI.lng, NAIROBI.lat];
		const map = new MapLibreGL.Map({
			container: containerRef.current,
			style: maptilerStyle,
			center,
			zoom: hasLocation ? PIN_ZOOM : EMPTY_ZOOM,
			interactive: true,
			attributionControl: false,
		});

		mapRef.current = map;
		map.addControl(new MapLibreGL.NavigationControl(), "bottom-right");
		map.addControl(
			new MapLibreGL.AttributionControl({ compact: true }),
			"bottom-left",
		);

		function removeMap() {
			markerRef.current?.remove();
			markerRef.current = null;
			if (mapRef.current === map) {
				map.remove();
				mapRef.current = null;
			}
		}

		function setMarker(nextLat: number, nextLng: number) {
			if (markerRef.current) {
				markerRef.current.setLngLat([nextLng, nextLat]);
				return;
			}
			markerRef.current = new MapLibreGL.Marker({
				color: "#166534",
				draggable: isInteractive,
			})
				.setLngLat([nextLng, nextLat])
				.addTo(map);
			markerRef.current.on("dragend", () => {
				const markerLngLat = markerRef.current?.getLngLat();
				if (!markerLngLat) return;
				onLocationChangeRef.current?.(markerLngLat.lat, markerLngLat.lng);
			});
		}

		function handleMapClick(event: MapMouseEvent) {
			if (!isInteractive) return;
			const { lat: clickLat, lng: clickLng } = event.lngLat;
			setMarker(clickLat, clickLng);
			onLocationChangeRef.current?.(clickLat, clickLng);
		}

		function flyToPin(nextLat: number, nextLng: number) {
			map.flyTo({ center: [nextLng, nextLat], zoom: PIN_ZOOM });
		}

		function handleLoad() {
			const pending = pendingRef.current;
			if (pending) {
				setMarker(pending.lat, pending.lng);
				flyToPin(pending.lat, pending.lng);
				pendingRef.current = null;
				return;
			}
			if (hasLocation) {
				setMarker(initialLocation.lat as number, initialLocation.lng as number);
				flyToPin(initialLocation.lat as number, initialLocation.lng as number);
			}
		}

		function handleError() {
			removeMap();
			setFailed(true);
		}

		if (isInteractive) {
			map.getCanvas().style.cursor = "crosshair";
			map.on("click", handleMapClick);
		}
		map.on("load", handleLoad);
		map.on("error", handleError);

		return () => {
			if (isInteractive) map.off("click", handleMapClick);
			map.off("load", handleLoad);
			map.off("error", handleError);
			removeMap();
		};
	}, [failed, maptilerStyle]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;

		if (typeof lat === "number" && typeof lng === "number") {
			if (!map.loaded()) {
				pendingRef.current = { lat, lng };
				return;
			}
			if (markerRef.current) {
				markerRef.current.setLngLat([lng, lat]);
			} else {
				markerRef.current = new MapLibreGL.Marker({
					color: "#166534",
					draggable: interactive,
				})
					.setLngLat([lng, lat])
					.addTo(map);
				markerRef.current.on("dragend", () => {
					const markerLngLat = markerRef.current?.getLngLat();
					if (!markerLngLat) return;
					onLocationChangeRef.current?.(markerLngLat.lat, markerLngLat.lng);
				});
			}
			map.flyTo({ center: [lng, lat], zoom: PIN_ZOOM });
			pendingRef.current = null;
			return;
		}

		pendingRef.current = null;
		markerRef.current?.remove();
		markerRef.current = null;
	}, [interactive, lat, lng]);

	if (!maptilerStyle || failed) return null;

	return (
		<section
			ref={containerRef}
			aria-label="Location map"
			className={cn(
				"h-52 w-full overflow-hidden rounded-xl border border-border bg-card",
				className,
			)}
		/>
	);
}
