import type { ProfileInput } from "@clc/core/features/signup/logic";
import { profileSchema } from "@clc/core/features/signup/logic";
import { getFieldError, useForm } from "@clc/core/lib/forms";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { Button } from "#/components/ui/button";
import { CountrySelect } from "#/components/ui/country-select";
import { Input } from "#/components/ui/input";
import { PhoneInputField } from "#/components/ui/phone-input";

// ── Component ──────────────────────────────────────────────────────────────────

type Props = {
	onNext: (data: ProfileInput) => void;
};

const DEFAULT_VALUES: ProfileInput = {
	name: "",
	email: "",
	phone: "",
	country: "",
};

export function OnboardingProfileForm({ onNext }: Props) {
	const navigate = useNavigate();

	const form = useForm({
		defaultValues: DEFAULT_VALUES,
		validators: { onChange: profileSchema },
		onSubmit: async ({ value }) => {
			console.log("[onboarding] profile:", value);
			onNext(value);
		},
	});

	return (
		<div className="flex min-h-screen flex-col bg-background">
			<div className="flex flex-col px-6 pb-12 pt-20">
				{/* Header */}
				<div className="mb-10 space-y-4">
					<button
						type="button"
						onClick={() => void navigate({ to: "/" })}
						className="mb-8 flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground"
						aria-label="Back"
					>
						<ArrowLeft className="size-4" />
						Back
					</button>

					<div className="space-y-1">
						<h1 className="font-heading text-[1.75rem] font-semibold leading-tight">
							Create your account
						</h1>
						<p className="text-sm text-muted-foreground">
							Name and country are required. Provide an email or phone number.
						</p>
					</div>
				</div>

				{/* Form */}
				<form
					aria-label="Create account"
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
									<label htmlFor="onb-name" className="text-sm font-medium">
										Name
									</label>
									<Input
										id="onb-name"
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
									<label htmlFor="onb-email" className="text-sm font-medium">
										Email
									</label>
									<Input
										id="onb-email"
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
									<label htmlFor="onb-phone" className="text-sm font-medium">
										Phone
									</label>
									<PhoneInputField
										id="onb-phone"
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
								<div className="flex flex-col gap-1.5">
									<label htmlFor="onb-country" className="text-sm font-medium">
										Country
									</label>
									<CountrySelect
										id="onb-country"
										value={field.state.value}
										onChange={(v) => field.handleChange(v)}
										aria-invalid={!!err}
										aria-label="Country"
									/>
									{err ? (
										<p className="text-xs text-destructive">{err}</p>
									) : null}
								</div>
							);
						}}
					</form.Field>

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

				{/* Footer */}
				<p className="mt-8 text-center text-sm text-muted-foreground">
					Already have an account?{" "}
					<Link
						to="/"
						className="font-medium text-foreground underline-offset-4 hover:underline"
					>
						Go back to sign in
					</Link>
				</p>
			</div>
		</div>
	);
}
