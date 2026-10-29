import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { useReportSectionCount } from "./voucher-section-bits";
import {
  useVoucherSectionCounts,
  VoucherSectionNav,
  VoucherSectionRegion,
} from "./voucher-section-nav";

const SECTIONS = ["offerings", "reviews", "posts", "activity"] as const;

function Reporter({
  onCount,
  count,
}: {
  onCount: (count: number | undefined) => void;
  count: number | undefined;
}) {
  useReportSectionCount(onCount, count);
  return null;
}

/** The page as VoucherDesk lays it out: a nav, then four regions that report their counts. */
function Page({
  reviews,
  offerings,
  showReviews = true,
}: {
  reviews?: number;
  offerings?: number;
  showReviews?: boolean;
}) {
  const { counts, report } = useVoucherSectionCounts();
  return (
    <div>
      <VoucherSectionNav counts={counts} />
      {SECTIONS.map((id) => (
        <VoucherSectionRegion key={id} id={id}>
          <h2>{id}</h2>
          {id === "reviews" && showReviews ? (
            <Reporter onCount={report.reviews} count={reviews} />
          ) : null}
          {id === "offerings" ? <Reporter onCount={report.offerings} count={offerings} /> : null}
        </VoucherSectionRegion>
      ))}
    </div>
  );
}

function nav() {
  return screen.getByRole("navigation", { name: "Voucher sections" });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VoucherSectionNav", () => {
  it("lists the four sections, with a count only for those that know theirs", () => {
    render(<Page reviews={4} offerings={undefined} />);
    const links = within(nav()).getAllByRole("link");
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      "Offerings",
      "Reviews 4",
      "Posts",
      "Activity",
    ]);
  });

  it("shows a count of zero, which is a known count", () => {
    render(<Page reviews={0} />);
    expect(within(nav()).getByRole("link", { name: "Reviews 0" })).toBeTruthy();
  });

  it("drops a count when its section stops reporting, so none goes stale", () => {
    const { rerender } = render(<Page reviews={4} />);
    expect(within(nav()).getByRole("link", { name: "Reviews 4" })).toBeTruthy();

    rerender(<Page reviews={undefined} />);
    expect(within(nav()).getByRole("link", { name: "Reviews" })).toBeTruthy();

    rerender(<Page reviews={4} />);
    rerender(<Page reviews={4} showReviews={false} />);
    expect(within(nav()).getByRole("link", { name: "Reviews" })).toBeTruthy();
  });

  it("scrolls to a section, moves focus into it and marks it as the current one", () => {
    const scrolled: string[] = [];
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) {
      scrolled.push(this.id);
    });
    render(<Page reviews={4} />);

    fireEvent.click(within(nav()).getByRole("link", { name: "Reviews 4" }));

    expect(scrolled).toEqual(["voucher-section-reviews"]);
    const region = screen.getByRole("region", { name: "Reviews" });
    expect(document.activeElement).toBe(region);
    expect(
      within(nav()).getByRole("link", { name: "Reviews 4" }).getAttribute("aria-current"),
    ).toBe("location");
    expect(
      within(nav()).getByRole("link", { name: "Posts" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("marks the section being read as the page scrolls", async () => {
    const tops: Record<string, number> = {
      "voucher-section-offerings": -900,
      "voucher-section-reviews": -300,
      "voucher-section-posts": 40,
      "voucher-section-activity": 700,
    };
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const top = tops[this.id] ?? 0;
        return {
          top,
          bottom: top + 400,
          left: 0,
          right: 0,
          width: 0,
          height: 400,
          x: 0,
          y: top,
          toJSON() {},
        };
      },
    );
    render(<Page />);

    act(() => {
      document.dispatchEvent(new Event("scroll"));
    });
    await waitFor(() =>
      expect(within(nav()).getByRole("link", { name: "Posts" }).getAttribute("aria-current")).toBe(
        "location",
      ),
    );

    tops["voucher-section-posts"] = -400;
    tops["voucher-section-activity"] = 30;
    act(() => {
      document.dispatchEvent(new Event("scroll"));
    });
    await waitFor(() =>
      expect(
        within(nav()).getByRole("link", { name: "Activity" }).getAttribute("aria-current"),
      ).toBe("location"),
    );
    expect(
      within(nav()).getByRole("link", { name: "Posts" }).getAttribute("aria-current"),
    ).toBeNull();
  });
});
