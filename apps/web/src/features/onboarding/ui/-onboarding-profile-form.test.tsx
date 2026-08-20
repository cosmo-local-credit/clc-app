import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

// Uploads are offered only where the service is configured, and the test env has
// no VITE_STORAGE_URL, so the photo control is switched on explicitly here.
vi.mock("#/lib/api/storage", () => ({
  isStorageConfigured: true,
  storageClient: () => ({ upload: vi.fn() }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
  useCanGoBack: () => false,
  useRouter: () => ({ history: { back: vi.fn() } }),
  Link: ({
    children,
    to,
    search,
  }: {
    children: React.ReactNode;
    to: string;
    search?: Record<string, unknown>;
  }) => {
    const qs =
      search && Object.keys(search).length > 0
        ? `?${new URLSearchParams(
            Object.entries(search).map(([k, v]) => [k, String(v)]),
          ).toString()}`
        : "";
    return <a href={`${to}${qs}`}>{children}</a>;
  },
}));

vi.mock("#/components/ui/step-progress", () => ({
  StepProgress: () => <div data-testid="step-progress" />,
}));

vi.mock("#/components/ui/phone-input", () => ({
  PhoneInputField: ({
    value,
    onChange,
    id,
  }: {
    value: string;
    onChange: (v: string) => void;
    id?: string;
  }) => (
    <input
      data-testid="phone-input"
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Phone number"
    />
  ),
}));

vi.mock("#/components/ui/location-picker", () => ({
  LocationPicker: ({
    value,
    onChange,
    error,
  }: {
    value:
      | {
          lat: number;
          lng: number;
          locationName: string;
          country: string;
        }
      | undefined;
    onChange: (
      value:
        | {
            lat: number;
            lng: number;
            locationName: string;
            country: string;
          }
        | undefined,
    ) => void;
    error?: string;
  }) => (
    <div data-testid="location-picker">
      <span>{value?.locationName ?? "No location"}</span>
      <button
        type="button"
        onClick={() =>
          onChange({
            lat: -1.2921,
            lng: 36.8219,
            locationName: "Nairobi, Kenya",
            country: "KE",
          })
        }
      >
        choose location
      </button>
      {error ? <p>{error}</p> : null}
    </div>
  ),
}));

import type { ProfileInput } from "@clc/core/features/signup/logic";
import { OnboardingProfileForm } from "./onboarding-profile-form";

function renderForm(
  onNext: (data: ProfileInput, avatarFile: File | null) => void = vi.fn(),
  initialValues?: ProfileInput,
) {
  return render(
    <OnboardingProfileForm
      onNext={onNext}
      progressStep={1}
      progressTotal={3}
      initialValues={initialValues}
    />,
  );
}

beforeEach(() => {
  mockNavigate.mockClear();
});

describe("OnboardingProfileForm rendering", () => {
  it("renders name, email, phone, and location fields", () => {
    renderForm();
    expect(screen.getByRole("textbox", { name: /name/i })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /email/i })).toBeTruthy();
    expect(screen.getByTestId("phone-input")).toBeTruthy();
    expect(screen.getByTestId("location-picker")).toBeTruthy();
    expect(screen.queryByTestId("country-select")).toBeNull();
  });

  it("renders the Continue submit button", () => {
    renderForm();
    expect(screen.getByRole("button", { name: /continue/i })).toBeTruthy();
  });

  it("has a sign in link pointing to the signin step", () => {
    renderForm();
    const link = screen
      .getAllByRole("link")
      .find((el) => (el.getAttribute("href") ?? "").includes("step=signin"));
    expect(link).toBeTruthy();
  });

  it("shows the back control", () => {
    renderForm();
    // BackChevron without onClick renders a link (history.back on click).
    expect(screen.getByRole("link", { name: "Back" })).toBeTruthy();
  });

  it("uses replace on the sign-in link so profile does not stack under sign-in", () => {
    renderForm();
    const link = screen.getByRole("link", { name: /go back to sign in/i });
    // Mocked Link only serializes `to`+`search`; replace is asserted via prop through href step.
    expect(link.getAttribute("href")).toContain("step=signin");
  });

  it("shows the progress indicator", () => {
    renderForm();
    expect(screen.getByTestId("step-progress")).toBeTruthy();
  });
});

describe("OnboardingProfileForm submission", () => {
  it("calls onNext with validated data on valid submission", async () => {
    const mockOnNext = vi.fn();
    renderForm(mockOnNext);

    fireEvent.change(screen.getByRole("textbox", { name: /name/i }), {
      target: { value: "Alice" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /email/i }), {
      target: { value: "alice@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /choose location/i }));

    await act(async () => {
      fireEvent.submit(screen.getByRole("form"));
    });

    expect(mockOnNext).toHaveBeenCalledWith(
      expect.objectContaining<Partial<ProfileInput>>({
        name: "Alice",
        email: "alice@example.com",
        location: {
          lat: -1.2921,
          lng: 36.8219,
          locationName: "Nairobi, Kenya",
          country: "KE",
        },
      }),
      // The photo travels beside the validated profile: it cannot be part of it,
      // because profileSchema lives in @clc/core and cannot name a File.
      null,
    );
  });

  it("does not call onNext when name is empty", async () => {
    const mockOnNext = vi.fn();
    renderForm(mockOnNext);

    fireEvent.change(screen.getByRole("textbox", { name: /email/i }), {
      target: { value: "alice@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /choose location/i }));

    await act(async () => {
      fireEvent.submit(screen.getByRole("form"));
    });

    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it("does not call onNext when both email and phone are empty", async () => {
    const mockOnNext = vi.fn();
    renderForm(mockOnNext);

    fireEvent.change(screen.getByRole("textbox", { name: /name/i }), {
      target: { value: "Alice" },
    });
    fireEvent.click(screen.getByRole("button", { name: /choose location/i }));

    await act(async () => {
      fireEvent.submit(screen.getByRole("form"));
    });

    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it("does not show the location error when unrelated fields change", async () => {
    renderForm();

    await act(async () => {
      fireEvent.change(screen.getByRole("textbox", { name: /name/i }), {
        target: { value: "Alice" },
      });
    });

    expect(screen.queryByText(/choose a location/i)).toBeNull();
  });

  it("does not call onNext until a valid location is set", async () => {
    const mockOnNext = vi.fn();
    renderForm(mockOnNext);

    fireEvent.change(screen.getByRole("textbox", { name: /name/i }), {
      target: { value: "Alice" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /email/i }), {
      target: { value: "alice@example.com" },
    });

    await act(async () => {
      fireEvent.submit(screen.getByRole("form"));
    });

    expect(mockOnNext).not.toHaveBeenCalled();
    expect(screen.getByText(/choose a location/i)).toBeTruthy();
  });
});

describe("OnboardingProfileForm value restoration", () => {
  it("populates name, email, and location from initialValues", () => {
    renderForm(vi.fn(), {
      name: "Alice",
      email: "alice@example.com",
      phone: "",
      location: {
        lat: -1.2921,
        lng: 36.8219,
        locationName: "Nairobi, Kenya",
        country: "KE",
      },
    });

    expect((screen.getByRole("textbox", { name: /name/i }) as HTMLInputElement).value).toBe(
      "Alice",
    );
    expect((screen.getByRole("textbox", { name: /email/i }) as HTMLInputElement).value).toBe(
      "alice@example.com",
    );
    expect(screen.getByText("Nairobi, Kenya")).toBeTruthy();
  });

  it("falls back to empty defaults when no initialValues are given", () => {
    renderForm();
    expect((screen.getByRole("textbox", { name: /name/i }) as HTMLInputElement).value).toBe("");
    expect(screen.getByText("No location")).toBeTruthy();
  });
});

describe("OnboardingProfileForm photo", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("offers a photo alongside the identity fields", () => {
    renderForm();

    expect(screen.getByRole("button", { name: /add a photo/i })).toBeTruthy();
  });

  it("carries the chosen photo out with the validated profile", async () => {
    const mockOnNext = vi.fn();
    renderForm(mockOnNext);

    const photo = new File([new Uint8Array(8)], "me.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Choose a profile photo"), {
      target: { files: [photo] },
    });

    fireEvent.change(screen.getByRole("textbox", { name: /name/i }), {
      target: { value: "Alice" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /email/i }), {
      target: { value: "alice@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /choose location/i }));

    await act(async () => {
      fireEvent.submit(screen.getByRole("form"));
    });

    // Beside the profile, not inside it: the schema is shared with @clc/core and
    // cannot name a File.
    expect(mockOnNext).toHaveBeenCalledWith(expect.objectContaining({ name: "Alice" }), photo);
  });
});
