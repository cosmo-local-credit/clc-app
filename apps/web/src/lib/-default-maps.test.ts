import { describe, expect, it, vi } from "vite-plus/test";

import { openDefaultMaps } from "./default-maps";

describe("openDefaultMaps", () => {
  it("uses Apple Maps on Apple platforms", () => {
    const navigate = vi.fn();

    expect(
      openDefaultMaps(
        { label: "C96, KEN", lat: -1.450979, lng: 38.235115 },
        {
          userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
          navigate,
        },
      ),
    ).toBe(true);

    expect(navigate).toHaveBeenCalledWith(
      "https://maps.apple.com/?ll=-1.450979%2C38.235115&q=C96%2C+KEN",
    );
  });

  it("uses the Android geo handler so the OS can choose the default maps app", () => {
    const navigate = vi.fn();

    openDefaultMaps(
      { label: "C96, KEN", lat: -1.450979, lng: 38.235115 },
      { userAgent: "Mozilla/5.0 (Linux; Android 15)", navigate },
    );

    expect(navigate).toHaveBeenCalledWith(
      "geo:-1.450979,38.235115?q=-1.450979%2C38.235115(C96%2C%20KEN)",
    );
  });

  it("uses exact coordinates for Google Maps even when a label is available", () => {
    const navigate = vi.fn();

    openDefaultMaps(
      { label: "C96, KEN", lat: -1.450979, lng: 38.235115 },
      { userAgent: "Mozilla/5.0 (X11; Linux x86_64)", navigate },
    );

    expect(navigate).toHaveBeenCalledWith(
      "https://www.google.com/maps/search/?api=1&query=-1.450979%2C38.235115",
    );
  });

  it("falls back to a label when no complete valid coordinate pair is available", () => {
    for (const target of [
      { label: "C96, KEN" },
      { label: "C96, KEN", lat: -1.450979 },
      { label: "C96, KEN", lat: Number.NaN, lng: 38.235115 },
      { label: "C96, KEN", lat: 91, lng: 38.235115 },
      { label: "C96, KEN", lat: -1.450979, lng: 181 },
    ]) {
      const navigate = vi.fn();
      openDefaultMaps(target, {
        userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
        navigate,
      });
      expect(navigate).toHaveBeenCalledWith(
        "https://www.google.com/maps/search/?api=1&query=C96%2C%20KEN",
      );
    }
  });

  it("does nothing when no location is available", () => {
    const navigate = vi.fn();

    expect(openDefaultMaps({}, { userAgent: "Mozilla/5.0 (Linux; Android 15)", navigate })).toBe(
      false,
    );
    expect(
      openDefaultMaps(
        { lat: Number.POSITIVE_INFINITY, lng: 36.8 },
        { userAgent: "Mozilla/5.0 (X11; Linux x86_64)", navigate },
      ),
    ).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
