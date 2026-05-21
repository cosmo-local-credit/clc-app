export type PasskeyProvider = "apple" | "google";

export function pickPasskeyProvider(): PasskeyProvider {
	if (typeof navigator === "undefined") return "google";
	const ua = navigator.userAgent;
	if (/iPhone|iPad|iPod|Macintosh/.test(ua) || /Mac OS X/.test(ua)) {
		return "apple";
	}
	return "google";
}

export function usePlatformPasskeyLabel(): {
	provider: PasskeyProvider;
	label: string;
} {
	const provider = pickPasskeyProvider();
	return {
		provider,
		label:
			provider === "apple" ? "Sign up with Apple ID" : "Sign up with Google",
	};
}
