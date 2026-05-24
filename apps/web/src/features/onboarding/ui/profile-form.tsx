import type { ProfileInput } from "@clc/core/features/signup/logic";
import { profileSchema } from "@clc/core/features/signup/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { CountrySelect } from "#/components/ui/country-select";
import { Input } from "#/components/ui/input";
import { PhoneInputField } from "#/components/ui/phone-input";
import { submitSignupProfile } from "#/features/onboarding/api/auth-client";

// ── Component ──────────────────────────────────────────────────────────────────

type Props = {
	address: `0x${string}`;
	onBack: () => void;
	onDone: () => void;
};

const DEFAULT_VALUES: ProfileInput = {
	name: "",
	email: "",
	phone: "",
	country: "",
};

export function ProfileForm({ address, onBack, onDone }: Props) {
	const [submitError, setSubmitError] = useState<string | null>(null);

	const form = useForm({
		defaultValues: DEFAULT_VALUES,
		validators: { onChange: profileSchema },
		onSubmit: async ({ value }) => {
			setSubmitError(null);
			try {
				await submitSignupProfile({ ...value, address });
				onDone();
			} catch (err) {
				setSubmitError(
					err instanceof Error ? err.message : "Submission failed.",
				);
			}
		},
	});

	return (
		<div className="flex min-h-screen flex-col bg-background">
			<div className="flex flex-col px-6 pb-12 pt-20">
				<div className="mb-10 space-y-4">
					<Button variant="ghost" className="h-11 w-fit px-0" onClick={onBack}>
						<ArrowLeft className="mr-2 size-4" />
						Back
					</Button>

					<div className="space-y-1">
						<h1 className="font-heading text-2xl font-semibold">
							Tell us about yourself
						</h1>
						<p className="text-sm text-muted-foreground">
							Optional — you can fill these in later.
						</p>
					</div>
				</div>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
					className="space-y-4"
				>
					{/* Name */}
					<form.Field name="name">
						{(field) => {
							const err = getFieldError(field.state.meta.errors);
							return (
								<div className="flex flex-col gap-1.5">
									<label htmlFor="profile-name" className="text-sm font-medium">
										Name
									</label>
									<Input
										id="profile-name"
										type="text"
										autoComplete="name"
										placeholder="Your name"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
										aria-invalid={!!err}
										aria-label="Name"
									/>
									{err ? (
										<p className="text-xs text-destructive">{err}</p>
									) : null}
								</div>
							);
						}}
					</form.Field>

					{/* Email */}
					<form.Field name="email">
						{(field) => {
							const err = getFieldError(field.state.meta.errors);
							return (
								<div className="flex flex-col gap-1.5">
									<label
										htmlFor="profile-email"
										className="text-sm font-medium"
									>
										Email
									</label>
									<Input
										id="profile-email"
										type="email"
										autoComplete="email"
										placeholder="you@example.com"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
										aria-invalid={!!err}
										aria-label="Email"
									/>
									{err ? (
										<p className="text-xs text-destructive">{err}</p>
									) : null}
								</div>
							);
						}}
					</form.Field>

					{/* Phone */}
					<form.Field name="phone">
						{(field) => {
							const err = getFieldError(field.state.meta.errors);
							return (
								<div className="flex flex-col gap-1.5">
									<label
										htmlFor="profile-phone"
										className="text-sm font-medium"
									>
										Phone
									</label>
									<PhoneInputField
										id="profile-phone"
										value={field.state.value}
										onChange={(val) => field.handleChange(val)}
										aria-invalid={!!err}
										aria-label="Phone number"
									/>
									{err ? (
										<p className="text-xs text-destructive">{err}</p>
									) : null}
								</div>
							);
						}}
					</form.Field>

					{/* Country */}
					<form.Field name="country">
						{(field) => {
							const err = getFieldError(field.state.meta.errors);
							return (
								<CountryPhoneSync countryValue={field.state.value} form={form}>
									<div className="flex flex-col gap-1.5">
										<label
											htmlFor="profile-country"
											className="text-sm font-medium"
										>
											Country
										</label>
										<CountrySelect
											id="profile-country"
											value={field.state.value}
											onChange={(v) => field.handleChange(v)}
											aria-invalid={!!err}
											aria-label="Country"
										/>
										{err ? (
											<p className="text-xs text-destructive">{err}</p>
										) : null}
									</div>
								</CountryPhoneSync>
							);
						}}
					</form.Field>

					{submitError ? (
						<p className="text-xs text-destructive">{submitError}</p>
					) : null}

					<form.Subscribe selector={(s) => s.isSubmitting}>
						{(isSubmitting) => (
							<Button
								type="submit"
								disabled={isSubmitting}
								className="h-11 w-full"
							>
								{isSubmitting ? (
									<LoaderCircle className="mr-2 size-4 animate-spin" />
								) : null}
								{isSubmitting ? "Saving…" : "Continue"}
							</Button>
						)}
					</form.Subscribe>
				</form>
			</div>
		</div>
	);
}

// ── Initial country ↔ phone sync helper ───────────────────────────────────────
// Q16=B: sync country → phone-country on first render only; then independent.
// This is handled inside PhoneInputField (it reads DEFAULT_COUNTRY from env).
// The CountryPhoneSync wrapper does nothing at runtime — it's a placeholder
// in case bi-directional sync is added later.

function CountryPhoneSync({
	children,
}: {
	countryValue: string;
	// biome-ignore lint/suspicious/noExplicitAny: TanStack Form generic type
	form: any;
	children: React.ReactNode;
}) {
	return <>{children}</>;
}
