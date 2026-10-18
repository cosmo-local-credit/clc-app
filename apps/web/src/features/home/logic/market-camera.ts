export type MarketCamera = {
  lat: number;
  lng: number;
  zoom: number;
  rank: number;
  /**
   * A view being given back rather than a place being found: it jumps
   * instead of easing, and the results fit it was taken under is not redone.
   */
  restore?: { fitKey: string | null };
};

export const EXPLICIT_CAMERA_RANK = 0;
