import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { PublicDisclosureNote } from "./public-disclosure-note";

describe("PublicDisclosureNote", () => {
  it("explains both public coordinate and contact consequences", () => {
    render(
      <>
        <PublicDisclosureNote kind="location" />
        <PublicDisclosureNote kind="contact" />
      </>,
    );

    expect(screen.getByText(/exact pin will be public/i)).toBeTruthy();
    expect(
      screen.getByText(/Contact details entered here are visible to signed-in users/i),
    ).toBeTruthy();
  });
});
