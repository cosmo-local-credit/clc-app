import { createFileRoute } from "@tanstack/react-router";
import { ExampleForm } from "#/features/_example/ui";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<div className="p-8 flex flex-col gap-6">
			<header>
				<h1 className="text-3xl font-bold">CLC App</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					PWA + TanStack Start. Feature logic stays portable; UI is web-only.
				</p>
			</header>
			<ExampleForm />
		</div>
	);
}
