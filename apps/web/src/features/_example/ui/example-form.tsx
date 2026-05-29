import {
	type GreetingInput,
	greetingSchema,
	useExampleStore,
	useGreetingQuery,
} from "@clc/core/features/_example/logic";
import { getFieldError, useForm, useStore } from "@clc/core/lib/forms";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";

export function ExampleForm() {
	const lastGreeted = useExampleStore((s) => s.lastGreeted);
	const setLastGreeted = useExampleStore((s) => s.setLastGreeted);

	const form = useForm({
		defaultValues: { name: lastGreeted ?? "" } satisfies GreetingInput,
		validators: {
			onChange: greetingSchema,
		},
		onSubmit: ({ value }) => {
			setLastGreeted(value.name);
			toast.success(`Saved: ${value.name}`);
		},
	});

	const name = useStore(form.store, (s) => s.values.name);
	const greeting = useGreetingQuery(name);

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
			className="flex max-w-sm flex-col gap-3"
		>
			<form.Field name="name">
				{(field) => {
					const error = getFieldError(field.state.meta.errors);
					return (
						<label className="flex flex-col gap-1 text-sm">
							<span>Name</span>
							<input
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								onBlur={field.handleBlur}
								className="rounded-md border px-3 py-2"
							/>
							{error && (
								<span className="text-destructive text-xs">{error}</span>
							)}
						</label>
					);
				}}
			</form.Field>

			{greeting.data && (
				<p className="text-muted-foreground text-sm">{greeting.data.message}</p>
			)}

			<Button type="submit">Save</Button>
		</form>
	);
}
