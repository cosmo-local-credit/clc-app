/** Request policy is independent of the human-readable cache identity. */
export type NearbyRequest = { nearby: false } | { nearby: true; scope: string };
