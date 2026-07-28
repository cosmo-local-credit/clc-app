import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { VoucherAvatar } from "./voucher-avatar";

const ADDRESS = "0xAbC0000000000000000000000000000000000123";

function renderAvatar(props: Partial<Parameters<typeof VoucherAvatar>[0]> = {}) {
  const { container } = render(
    <VoucherAvatar address={ADDRESS} symbol="MALII" iconUrl={null} size={40} {...props} />,
  );
  const root = container.firstElementChild as HTMLElement;
  return { root, image: () => root.querySelector("img") };
}

describe("VoucherAvatar", () => {
  it("hides the profile image behind a skeleton until it finishes loading", () => {
    const { root, image } = renderAvatar({ iconUrl: "https://content.example/icon.jpg" });
    const img = image();

    expect(img?.getAttribute("src")).toBe("https://content.example/icon.jpg");
    // Third-party images on a mobile map: never block the basemap for them.
    expect(img?.getAttribute("loading")).toBe("lazy");
    expect(img?.dataset.state).toBe("loading");
    expect(root.querySelector('[data-slot="skeleton"]')).not.toBeNull();

    fireEvent.load(img as HTMLImageElement);

    expect(image()?.dataset.state).toBe("loaded");
    expect(root.querySelector('[data-slot="skeleton"]')).toBeNull();
  });

  // Roughly two thirds of the imported catalog has no icon, so the fallback is
  // the common case, not the edge case.
  it("falls back to the symbol when there is no image", () => {
    const { root, image } = renderAvatar();

    expect(image()).toBeNull();
    expect(root.textContent).toBe("MA");
  });

  // These URLs point at a third-party host, so some of them 404. A broken
  // image glyph in place of a voucher's identity is worse than initials.
  it("falls back to the symbol when the image fails to load", () => {
    const { root, image } = renderAvatar({ iconUrl: "https://content.example/missing.jpg" });
    const img = image();
    expect(img).not.toBeNull();

    fireEvent.error(img as HTMLImageElement);

    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toBe("MA");
  });

  // The card and the page show the same voucher, so its fallback colour has to
  // match in both. Seeding from the address keeps it stable even where the
  // symbol differs, and casing must not change it.
  it("derives a stable colour from the address, not the symbol", () => {
    const background = (props: Partial<Parameters<typeof VoucherAvatar>[0]>) =>
      renderAvatar(props).root.style.background;

    expect(background({})).toBe(background({ symbol: "OTHER" }));
    expect(background({})).toBe(background({ address: ADDRESS.toLowerCase() }));
    expect(background({})).not.toBe(
      background({ address: "0x0000000000000000000000000000000000000456" }),
    );
  });

  it("is hidden from assistive technology, since the name is always beside it", () => {
    expect(renderAvatar().root.getAttribute("aria-hidden")).toBe("true");
    expect(
      renderAvatar({ iconUrl: "https://content.example/icon.jpg" }).root.getAttribute(
        "aria-hidden",
      ),
    ).toBe("true");
  });
});
