import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";
import { InstallAppButton } from "#/components/install-app-button";

vi.mock("#/components/install-app-dialog", () => {
  throw new Error("Chunk unavailable");
});

it("keeps the install CTA usable and shows help when its lazy chunk fails", async () => {
  render(<InstallAppButton />);
  fireEvent.click(screen.getByRole("button", { name: "Install CLC" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Couldn't open installation. Follow the steps below or try again later.",
  );
  expect(screen.getByRole("button", { name: "Install CLC" })).toHaveProperty("disabled", false);
});
