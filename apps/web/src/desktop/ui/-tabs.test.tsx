import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vite-plus/test";

import { DeskTab, DeskTabPanel, DeskTabs } from "./tabs";

const IDS = ["offers", "wants", "posts"] as const;

function LocalTabs() {
  const [value, setValue] = useState<(typeof IDS)[number]>("offers");
  return (
    <>
      <DeskTabs kind="tabs" label="Sections">
        {IDS.map((id) => (
          <DeskTab key={id} active={value === id} id={`tab-${id}`} controls={`panel-${id}`}>
            <button type="button" onClick={() => setValue(id)}>
              {id}
            </button>
          </DeskTab>
        ))}
      </DeskTabs>
      <DeskTabPanel id={`panel-${value}`} tabId={`tab-${value}`}>
        {value} content
      </DeskTabPanel>
    </>
  );
}

describe("DeskTabs as a tablist", () => {
  it("exposes tab roles, a roving tabindex and the panel it controls", () => {
    render(<LocalTabs />);
    const tablist = screen.getByRole("tablist", { name: "Sections" });
    expect(tablist).toBeTruthy();

    const offers = screen.getByRole("tab", { name: "offers" });
    const wants = screen.getByRole("tab", { name: "wants" });
    expect(offers.getAttribute("aria-selected")).toBe("true");
    expect(wants.getAttribute("aria-selected")).toBe("false");
    expect(offers.tabIndex).toBe(0);
    expect(wants.tabIndex).toBe(-1);
    expect(offers.getAttribute("aria-controls")).toBe("panel-offers");

    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe("tab-offers");
    expect(panel.textContent).toBe("offers content");
  });

  it("moves focus and selection with the arrow keys, Home and End, wrapping at the ends", () => {
    render(<LocalTabs />);
    const tab = (name: string) => screen.getByRole("tab", { name });

    tab("offers").focus();
    fireEvent.keyDown(tab("offers"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tab("wants"));
    expect(tab("wants").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toBe("wants content");

    fireEvent.keyDown(tab("wants"), { key: "End" });
    expect(document.activeElement).toBe(tab("posts"));

    fireEvent.keyDown(tab("posts"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tab("offers"));

    fireEvent.keyDown(tab("offers"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tab("posts"));

    fireEvent.keyDown(tab("posts"), { key: "Home" });
    expect(document.activeElement).toBe(tab("offers"));
    expect(screen.getByRole("tabpanel").textContent).toBe("offers content");
  });

  it("ignores keys it does not own", () => {
    render(<LocalTabs />);
    const offers = screen.getByRole("tab", { name: "offers" });
    offers.focus();
    fireEvent.keyDown(offers, { key: "a" });
    expect(document.activeElement).toBe(offers);
  });
});

describe("DeskTabs as navigation", () => {
  it("keeps links as links and marks the current one", () => {
    render(
      <DeskTabs label="Marketplace">
        <DeskTab active>
          <a href="/market?scope=offers">Offers</a>
        </DeskTab>
        <DeskTab active={false}>
          <a href="/market?scope=wants">Wants</a>
        </DeskTab>
      </DeskTabs>,
    );
    expect(screen.getByRole("navigation", { name: "Marketplace" })).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByRole("link", { name: "Offers" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Wants" }).getAttribute("aria-current")).toBeNull();
  });
});
