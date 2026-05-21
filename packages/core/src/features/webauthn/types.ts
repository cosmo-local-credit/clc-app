import { z } from "zod";

const hex = z.custom<`0x${string}`>(
	(v) => typeof v === "string" && /^0x[0-9a-fA-F]*$/.test(v),
);
const decString = z.string().regex(/^\d+$/, "Must be a decimal string");
const checksumAddr = hex;

export const eip7702AuthSchema = z.object({
	chainId: decString,
	contractAddress: checksumAddr,
	nonce: decString,
	yParity: z.number().int().min(0).max(1),
	r: hex,
	s: hex,
});
export type EIP7702Auth = z.infer<typeof eip7702AuthSchema>;

export const caliburCallSchema = z.object({
	to: checksumAddr,
	value: decString,
	data: hex,
});
export type CaliburCallInput = z.infer<typeof caliburCallSchema>;

export const caliburBatchedCallSchema = z.object({
	calls: z.array(caliburCallSchema).min(1),
	revertOnFailure: z.boolean(),
});

export const signedBatchSchema = z.object({
	batchedCall: caliburBatchedCallSchema,
	nonce: decString,
	keyHash: hex,
	executor: checksumAddr,
	deadline: decString,
});
export type SignedBatchInput = z.infer<typeof signedBatchSchema>;

export const webAuthnCredentialSchema = z.object({
	credentialId: z.string().min(1),
	keyHash: hex,
	publicKeyX: decString,
	publicKeyY: decString,
	address: checksumAddr,
	stale: z.boolean().default(false),
});
export type WebAuthnCredential = z.infer<typeof webAuthnCredentialSchema>;
