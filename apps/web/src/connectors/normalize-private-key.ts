type NormalizeResult =
	| { ok: true; key: `0x${string}` }
	| { ok: false; error: string };

const HEX_64 = /^[0-9a-fA-F]{64}$/;

export function normalizePrivateKey(raw: string): NormalizeResult {
	const trimmed = raw.trim();

	if (!trimmed) {
		return { ok: false, error: "Private key is empty." };
	}

	// v1 paper wallet: URL with ?w=<key>
	let candidate = trimmed;
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		try {
			const url = new URL(trimmed);
			const w = url.searchParams.get("w");
			if (!w) {
				return {
					ok: false,
					error: "URL does not contain a private key (?w= parameter missing).",
				};
			}
			candidate = w;
		} catch {
			return {
				ok: false,
				error:
					"Invalid private key. Must be 64 hex characters, with or without 0x prefix.",
			};
		}
	}

	// Already 0x-prefixed
	if (candidate.startsWith("0x") || candidate.startsWith("0X")) {
		const body = candidate.slice(2);
		if (HEX_64.test(body)) {
			return { ok: true, key: `0x${body.toLowerCase()}` };
		}
		return {
			ok: false,
			error: "Invalid private key. Must be 0x-prefixed 64-char hex.",
		};
	}

	// Bare hex — prepend 0x
	if (HEX_64.test(candidate)) {
		return { ok: true, key: `0x${candidate.toLowerCase()}` };
	}

	return {
		ok: false,
		error:
			"Invalid private key. Must be 64 hex characters, with or without 0x prefix.",
	};
}
