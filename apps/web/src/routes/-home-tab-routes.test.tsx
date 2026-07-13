import { render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (options: { component: ComponentType }) => ({
    path,
    ...options,
  }),
}));

vi.mock("#/components/home-route-page", () => ({
  HomeRoutePage: ({ activeTab }: { activeTab: string }) => (
    <div data-testid={`home-route-${activeTab}`} />
  ),
}));

import { Route as ActivityRoute } from "./activity";
import { Route as MarketRoute } from "./market";
import { Route as PoolRoute } from "./pool";
import { Route as SettingsRoute } from "./settings";

type RouteFixture = {
  path: string;
  component: ComponentType;
};

describe("home tab routes", () => {
  it("registers first-class paths for non-wallet tabs", () => {
    expect((ActivityRoute as unknown as RouteFixture).path).toBe("/activity");
    expect((MarketRoute as unknown as RouteFixture).path).toBe("/market");
    expect((PoolRoute as unknown as RouteFixture).path).toBe("/pool");
    expect((SettingsRoute as unknown as RouteFixture).path).toBe("/settings");
  });

  it("renders activity from the /activity route", () => {
    const Activity = (ActivityRoute as unknown as RouteFixture).component;

    render(<Activity />);

    expect(screen.getByTestId("home-route-activity")).toBeTruthy();
  });

  it("renders settings from the /settings route", () => {
    const Settings = (SettingsRoute as unknown as RouteFixture).component;

    render(<Settings />);

    expect(screen.getByTestId("home-route-settings")).toBeTruthy();
  });
});
