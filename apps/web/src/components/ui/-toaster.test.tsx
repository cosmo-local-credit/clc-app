import { act, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const localeState = vi.hoisted(() => ({ locale: "en" as "ar" | "en" }));

vi.mock("#/providers/i18n", () => ({
  useLocale: () => ({ locale: localeState.locale }),
}));

import { AppToaster } from "./toaster";

afterEach(() => {
  toast.dismiss();
});

describe("AppToaster", () => {
  beforeEach(() => {
    localeState.locale = "en";
  });

  it("shows app-styled notifications from the top-right edge without close-button chrome", async () => {
    render(<AppToaster />);

    act(() => {
      toast.success("Address copied", { description: "Ready to share" });
    });

    const notification = await screen.findByText("Address copied");
    expect(notification.textContent).toBe("Address copied");
    expect(screen.getByText("Ready to share").textContent).toBe("Ready to share");

    const toaster = notification.closest("[data-sonner-toaster]");
    expect(toaster?.getAttribute("data-x-position")).toBe("right");
    expect(toaster?.getAttribute("data-y-position")).toBe("top");

    await waitFor(() => {
      const toastElement = notification.closest("[data-sonner-toast]");
      const className = toastElement?.getAttribute("class") ?? "";
      expect(className).toContain("rounded-none");
      expect(className).toContain("bg-card");
      expect(className).toContain("font-sans");
      expect(className).toContain("shadow-none");
      expect(className).toContain("border-s-primary");
    });

    expect(screen.queryByLabelText(/close toast/i)).toBeNull();
  });

  it("uses the inline-start edge and swipe direction in Arabic", async () => {
    localeState.locale = "ar";
    render(<AppToaster />);

    act(() => {
      toast.success("تم نسخ العنوان");
    });

    const notification = await screen.findByText("تم نسخ العنوان");
    const toaster = notification.closest("[data-sonner-toaster]");
    expect(toaster?.getAttribute("data-x-position")).toBe("left");
    expect(toaster?.getAttribute("data-y-position")).toBe("top");
  });
});
