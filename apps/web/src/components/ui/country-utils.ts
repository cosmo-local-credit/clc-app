export function getFlagEmoji(code: string): string {
	return code
		.toUpperCase()
		.split("")
		.map((c) => String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0)))
		.join("");
}
