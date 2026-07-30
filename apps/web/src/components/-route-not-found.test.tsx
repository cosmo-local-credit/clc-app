import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { RouteNotFound } from "./route-not-found";

describe("RouteNotFound", () => {
  it("renders a useful fallback with a link home", () => {
    render(<RouteNotFound />);

    expect(screen.getByRole("heading", { name: "Page not found" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go home" }).getAttribute("href")).toBe("/");
  });
});
