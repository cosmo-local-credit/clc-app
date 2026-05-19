import { z } from "zod";

export const greetingSchema = z.object({
	name: z.string().min(1, "Name is required").max(50),
});

export type GreetingInput = z.infer<typeof greetingSchema>;
