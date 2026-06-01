import MapLibreGL, {
	type GeoJSONSource,
	type MapLayerMouseEvent,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { RiCupLine, RiShoppingBagLine, RiToolsLine } from "react-icons/ri";

import { cn } from "#/lib/utils";
import type { MarketLocation, MarketLocationKind } from "./market-data";

const NAIROBI = { lat: -1.2921, lng: 36.8219 };
const USER_ZOOM = 14;
const MARKET_ZOOM = 15;
const SOURCE_ID = "market-locations";
const CLUSTERS_LAYER_ID = "market-clusters";
const CLUSTER_COUNT_LAYER_ID = "market-cluster-count";
const UNCLUSTERED_LAYER_ID = "market-points";

type UserLocation = { lat: number; lng: number };

type MarketFeature = {
	type: "Feature";
	properties: {
		id: string;
		kind: MarketLocationKind;
		name: string;
	};
	geometry: {
		type: "Point";
		coordinates: [number, number];
	};
};

type MarketFeatureCollection = {
	type: "FeatureCollection";
	features: MarketFeature[];
};

const markerColors: Record<MarketLocationKind, string> = {
	eatery: "#f97316",
	shop: "#0ea5e9",
	service: "#22c55e",
};

const markerImageIds: Record<MarketLocationKind, string> = {
	eatery: "market-eatery",
	shop: "market-shop",
	service: "market-service",
};

function MarkerGlyph({ kind }: { kind: MarketLocationKind }) {
	if (kind === "eatery")
		return <RiCupLine className="size-3.5" aria-hidden="true" />;
	if (kind === "shop")
		return <RiShoppingBagLine className="size-3.5" aria-hidden="true" />;
	return <RiToolsLine className="size-3.5" aria-hidden="true" />;
}

type MarketMapProps = {
	locations: MarketLocation[];
	selectedLocationId: string | null;
	userLocation: UserLocation | null;
	onSelectLocation: (id: string) => void;
	className?: string;
};

function hasWebGlSupport(): boolean {
	const canvas = document.createElement("canvas");
	return !!(
		canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl")
	);
}

function createMarketFeatureCollection(
	locations: MarketLocation[],
): MarketFeatureCollection {
	return {
		type: "FeatureCollection",
		features: locations.map((location) => ({
			type: "Feature",
			properties: {
				id: location.id,
				kind: location.kind,
				name: location.name,
			},
			geometry: {
				type: "Point",
				coordinates: [location.lng, location.lat],
			},
		})),
	};
}

function createMarkerImage(kind: MarketLocationKind): {
	data: ImageData;
	pixelRatio: number;
} {
	const canvas = document.createElement("canvas");
	const pixelRatio = window.devicePixelRatio || 1;
	const size = 20;
	canvas.width = size * pixelRatio;
	canvas.height = size * pixelRatio;
	const ctx = canvas.getContext("2d");
	if (!ctx) return { data: new ImageData(size, size), pixelRatio: 1 };

	ctx.scale(pixelRatio, pixelRatio);
	ctx.clearRect(0, 0, size, size);
	ctx.fillStyle = markerColors[kind];
	ctx.beginPath();
	ctx.arc(size / 2, size / 2, 8, 0, Math.PI * 2);
	ctx.fill();

	ctx.strokeStyle = "#ffffff";
	ctx.fillStyle = "#ffffff";
	ctx.lineWidth = 1.4;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";

	if (kind === "eatery") {
		ctx.beginPath();
		ctx.moveTo(7, 6);
		ctx.lineTo(7, 15);
		ctx.moveTo(5.5, 6);
		ctx.lineTo(5.5, 9);
		ctx.moveTo(8.5, 6);
		ctx.lineTo(8.5, 9);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(13, 6);
		ctx.lineTo(13, 15);
		ctx.moveTo(11.5, 6);
		ctx.quadraticCurveTo(15.5, 8, 13, 11);
		ctx.stroke();
		return {
			data: ctx.getImageData(0, 0, canvas.width, canvas.height),
			pixelRatio,
		};
	}

	if (kind === "shop") {
		ctx.strokeRect(6, 8, 8, 7);
		ctx.beginPath();
		ctx.moveTo(7.5, 8);
		ctx.quadraticCurveTo(10, 4.5, 12.5, 8);
		ctx.stroke();
		return {
			data: ctx.getImageData(0, 0, canvas.width, canvas.height),
			pixelRatio,
		};
	}

	ctx.beginPath();
	ctx.moveTo(7, 14);
	ctx.lineTo(13, 8);
	ctx.moveTo(12, 6.5);
	ctx.lineTo(15, 9.5);
	ctx.moveTo(5.5, 15.5);
	ctx.lineTo(8, 13);
	ctx.stroke();
	return {
		data: ctx.getImageData(0, 0, canvas.width, canvas.height),
		pixelRatio,
	};
}

function createUserMarker(): HTMLDivElement {
	const marker = document.createElement("div");
	marker.className =
		"relative flex size-7 items-center justify-center rounded-full bg-transparent";
	marker.innerHTML =
		"<span class='absolute size-5 rounded-full bg-foreground/30 animate-ping'></span><span class='relative size-2 rounded-full bg-foreground'></span>";
	return marker;
}

function addMarketImages(map: MapLibreGL.Map) {
	for (const kind of ["eatery", "shop", "service"] as const) {
		const imageId = markerImageIds[kind];
		if (!map.hasImage(imageId)) {
			const image = createMarkerImage(kind);
			map.addImage(imageId, image.data, { pixelRatio: image.pixelRatio });
		}
	}
}

function addMarketLayers(map: MapLibreGL.Map, locations: MarketLocation[]) {
	addMarketImages(map);
	map.addSource(SOURCE_ID, {
		type: "geojson",
		data: createMarketFeatureCollection(locations),
		cluster: true,
		clusterMaxZoom: 13,
		clusterRadius: 80,
	});
	map.addLayer({
		id: CLUSTERS_LAYER_ID,
		type: "circle",
		source: SOURCE_ID,
		filter: ["has", "point_count"],
		paint: {
			"circle-color": "#111827",
			"circle-radius": 14,
			"circle-stroke-width": 0,
		},
	});
	map.addLayer({
		id: CLUSTER_COUNT_LAYER_ID,
		type: "symbol",
		source: SOURCE_ID,
		filter: ["has", "point_count"],
		layout: {
			"text-field": "{point_count_abbreviated}",
			"text-size": 11,
		},
		paint: {
			"text-color": "#ffffff",
		},
	});
	map.addLayer({
		id: UNCLUSTERED_LAYER_ID,
		type: "symbol",
		source: SOURCE_ID,
		filter: ["!", ["has", "point_count"]],
		layout: {
			"icon-image": [
				"match",
				["get", "kind"],
				"eatery",
				markerImageIds.eatery,
				"shop",
				markerImageIds.shop,
				"service",
				markerImageIds.service,
				markerImageIds.shop,
			],
			"icon-size": 1,
			"icon-allow-overlap": true,
		},
	});
}

export function MarketMap({
	locations,
	selectedLocationId,
	userLocation,
	onSelectLocation,
	className,
}: MarketMapProps) {
	const containerRef = useRef<HTMLElement>(null);
	const mapRef = useRef<MapLibreGL.Map | null>(null);
	const userMarkerRef = useRef<MapLibreGL.Marker | null>(null);
	const [failed, setFailed] = useState(false);
	const [loaded, setLoaded] = useState(false);
	const maptilerKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
	const maptilerStyle = maptilerKey
		? `https://api.maptiler.com/maps/base-v4/style.json?key=${encodeURIComponent(maptilerKey)}`
		: null;

	useEffect(() => {
		if (!maptilerStyle || failed || !containerRef.current || mapRef.current) {
			return;
		}
		if (!hasWebGlSupport()) {
			setFailed(true);
			return;
		}

		const center: [number, number] = userLocation
			? [userLocation.lng, userLocation.lat]
			: [NAIROBI.lng, NAIROBI.lat];
		let map: MapLibreGL.Map;
		try {
			map = new MapLibreGL.Map({
				container: containerRef.current,
				style: maptilerStyle,
				center,
				zoom: userLocation ? USER_ZOOM : 12,
				attributionControl: false,
			});
		} catch {
			setFailed(true);
			return;
		}

		mapRef.current = map;

		function handlePointClick(event: MapLayerMouseEvent) {
			const id = event.features?.[0]?.properties?.id;
			if (typeof id === "string") onSelectLocation(id);
		}

		function handleClusterClick(event: MapLayerMouseEvent) {
			const feature = event.features?.[0];
			const clusterId = feature?.properties?.cluster_id;
			if (typeof clusterId !== "number") return;
			const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
			void source?.getClusterExpansionZoom(clusterId).then((zoom) => {
				if (!feature) return;
				const coordinates =
					feature.geometry.type === "Point"
						? feature.geometry.coordinates
						: null;
				if (!coordinates) return;
				map.easeTo({ center: coordinates as [number, number], zoom });
			});
		}

		function handleLoad() {
			addMarketLayers(map, locations);
			map.on("click", UNCLUSTERED_LAYER_ID, handlePointClick);
			map.on("click", CLUSTERS_LAYER_ID, handleClusterClick);
			setLoaded(true);
		}

		map.on("load", handleLoad);

		return () => {
			map.off("load", handleLoad);
			map.off("click", UNCLUSTERED_LAYER_ID, handlePointClick);
			map.off("click", CLUSTERS_LAYER_ID, handleClusterClick);
			userMarkerRef.current?.remove();
			userMarkerRef.current = null;
			map.remove();
			mapRef.current = null;
			setLoaded(false);
		};
	}, [failed, locations, maptilerStyle, onSelectLocation, userLocation]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map || !loaded) return;
		const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
		if (!source) return;
		source.setData(createMarketFeatureCollection(locations));
	}, [loaded, locations]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map || !loaded) return;

		if (userLocation) {
			if (userMarkerRef.current) {
				userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
			} else {
				userMarkerRef.current = new MapLibreGL.Marker({
					element: createUserMarker(),
				})
					.setLngLat([userLocation.lng, userLocation.lat])
					.addTo(map);
			}
			map.flyTo({
				center: [userLocation.lng, userLocation.lat],
				zoom: USER_ZOOM,
			});
			return;
		}

		userMarkerRef.current?.remove();
		userMarkerRef.current = null;
	}, [loaded, userLocation]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map || !loaded || !selectedLocationId) return;
		const selected = locations.find(
			(location) => location.id === selectedLocationId,
		);
		if (!selected) return;
		map.flyTo({ center: [selected.lng, selected.lat], zoom: MARKET_ZOOM });
	}, [loaded, locations, selectedLocationId]);

	if (!maptilerStyle || failed) {
		return (
			<section
				aria-label="Market map"
				className={cn(
					"market-map-fallback relative overflow-hidden bg-card",
					className,
				)}
			>
				<div className="absolute top-1/2 left-1/2 z-10 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-transparent">
					<span className="absolute size-5 animate-ping rounded-full bg-foreground/30" />
					<span className="relative size-2 rounded-full bg-foreground" />
				</div>
				{locations.map((location, index) => {
					const positions = [
						"left-[62%] top-[30%]",
						"left-[24%] top-[64%]",
						"left-[16%] top-[44%]",
					];
					return (
						<button
							key={location.id}
							type="button"
							aria-label={`${location.name}, ${location.distance}`}
							className={cn(
								"absolute z-20 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-transparent text-white transition-transform active:scale-95",
								positions[index] ?? "top-1/2 left-1/2",
								selectedLocationId === location.id && "scale-110",
							)}
							style={{ backgroundColor: markerColors[location.kind] }}
							onClick={() => onSelectLocation(location.id)}
						>
							<MarkerGlyph kind={location.kind} />
						</button>
					);
				})}
			</section>
		);
	}

	return (
		<section
			ref={containerRef}
			aria-label="Market map"
			className={cn("bg-card", className)}
		/>
	);
}
