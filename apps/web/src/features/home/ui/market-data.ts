export type MarketLocationKind = "eatery" | "shop" | "service";

export type MarketLocation = {
	id: string;
	name: string;
	category: string;
	kind: MarketLocationKind;
	distance: string;
	lat: number;
	lng: number;
};

export const placeholderMarketLocations: MarketLocation[] = [
	{
		id: "bakery",
		name: "Cosmo Bakery",
		category: "Eatery",
		kind: "eatery",
		distance: "150m away",
		lat: -1.2864,
		lng: 36.8233,
	},
	{
		id: "market",
		name: "Green Basket Market",
		category: "Shop",
		kind: "shop",
		distance: "420m away",
		lat: -1.3011,
		lng: 36.8126,
	},
	{
		id: "repair",
		name: "Mtaa Repair Hub",
		category: "Service",
		kind: "service",
		distance: "680m away",
		lat: -1.2758,
		lng: 36.8347,
	},
];
