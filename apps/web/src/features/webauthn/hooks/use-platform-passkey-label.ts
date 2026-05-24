export type PasskeyProvider = "apple" | "google";

/**
 * True only on Chrome Android and Safari Mobile (iOS/iPadOS).
 * These are the only platforms where stored platform passkeys reliably work.
 * Desktop browsers, Firefox mobile, Chrome iOS (CriOS), and Samsung Browser
 * are all excluded.
 */
export function isPasskeyPlatformAvailable(): boolean {
	if (typeof navigator === "undefined") return false;
	const ua = navigator.userAgent;
	// iOS/iPadOS Safari — exclude CriOS (Chrome) and FxiOS (Firefox)
	const isAppleMobileSafari =
		/iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
	// Android Chrome — must have "Chrome/" but not "SamsungBrowser"
	const isAndroidChrome =
		/Android/.test(ua) && /Chrome\//.test(ua) && !/SamsungBrowser/.test(ua);
	return isAppleMobileSafari || isAndroidChrome;
}

export function pickPasskeyProvider(): PasskeyProvider {
	if (typeof navigator === "undefined") return "google";
	const ua = navigator.userAgent;
	if (/iPhone|iPad|iPod/.test(ua)) return "apple";
	return "google";
}

export function usePlatformPasskeyLabel(): {
	available: boolean;
	provider: PasskeyProvider;
	label: string;
} {
	const available = isPasskeyPlatformAvailable();
	const provider = pickPasskeyProvider();
	return {
		available,
		provider,
		label: provider === "apple" ? "Apple ID" : "Google",
	};
}
