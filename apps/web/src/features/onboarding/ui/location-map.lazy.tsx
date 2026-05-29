import { lazy } from "react";

export const LocationMap = lazy(() =>
	import("./location-map").then((module) => ({
		default: module.LocationMap,
	})),
);
