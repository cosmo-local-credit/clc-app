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

  it("falls back to a universal web maps search on other platforms", () => {
    const navigate = vi.fn();

    openDefaultMaps(
      { label: "C96, KEN" },
      { userAgent: "Mozilla/5.0 (X11; Linux x86_64)", navigate },
    );

    expect(navigate).toHaveBeenCalledWith(
      "https://www.google.com/maps/search/?api=1&query=C96%2C%20KEN",
    );
  });

  it("does nothing when no location is available", () => {
    const navigate = vi.fn();

    expect(openDefaultMaps({}, { userAgent: "Mozilla/5.0 (Linux; Android 15)", navigate })).toBe(
      false,
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
