import type { StandardSchemaV1Issue } from "@tanstack/react-form";

export { useForm, useStore } from "@tanstack/react-form";

/**
 * Extracts a display string from a TanStack Form field's `meta.errors` array.
 *
 * When using Standard Schema validators (zod, valibot, …) errors are
 * StandardSchemaV1Issue objects. Plain function validators return strings.
 * This handles both so callers don't need to branch.
 */
export function getFieldError(
	errors: Array<StandardSchemaV1Issue | string | undefined>,
): string | null {
	const first = errors.find((e) => e !== undefined);
	if (first === undefined) return null;
	if (typeof first === "string") return first;
	return first.message;
}
