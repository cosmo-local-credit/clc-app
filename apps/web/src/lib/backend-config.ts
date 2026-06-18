export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:5003";

export const RELAYER_URL: string =
  (import.meta.env.VITE_RELAYER_URL as string | undefined) ?? `${API_URL}/api/v2/relayer`;

export const CALIBUR_ADDRESS = (import.meta.env.VITE_CALIBUR_ADDRESS ??
  "0x1289fE793392fb1a905f78Ea23f632EDD3d15b85") as `0x${string}`;
