import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { mockNavigate, mockResolveProfileCountry } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockResolveProfileCountry: vi.fn(),
}));

// Uploads are offered only where the service is configured, and the test env has
// no VITE_STORAGE_URL, so the photo control is switched on explicitly here.
vi.mock("#/lib/api/storage", () => ({
  isStorageConfigured: true,
  storageClient: () => ({ upload: vi.fn() }),
}));

vi.mock("#/lib/profile-currency", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/lib/profile-currency")>();
  return { ...actual, resolveProfileCountry: mockResolveProfileCountry };
});

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
    defaultCountry,
  }: {
    value: string;
    onChange: (v: string) => void;
    id?: string;
    defaultCountry?: string | null;
  }) => (
    <input
      data-testid="phone-input"
      data-default-country={defaultCountry ?? ""}
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
    required,
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
    required?: boolean;
  }) => (
    <div data-testid="location-picker">
      <span>{value?.locationName ?? "No location"}</span>
      {required ? <span className="text-destructive">Required</span> : null}
      <input
        aria-label="Location"
        aria-invalid={Boolean(error)}
        aria-required={required || undefined}
      />
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
import type { ProfilePage } from "#/lib/onboarding-search";
import { OnboardingProfileForm } from "./onboarding-profile-form";

const PHOTO = new File([new Uint8Array(8)], "me.jpg", { type: "image/jpeg" });

/** Plays the flow's part: Continue moves the page, as pushing a step would. */
function Harness({
  onNext,
  onRestart,
  initialValues,
  initialAvatarFile,
  startPage,
}: {
  onNext: (data: ProfileInput, avatarFile: File) => void;
  onRestart: () => void;
  initialValues?: ProfileInput;
  initialAvatarFile?: File;
  startPage: ProfilePage;
}) {
  const [page, setPage] = useState<ProfilePage>(startPage);
  return (
    <>
      <span data-testid="page">{page}</span>
      <button type="button" onClick={() => setPage("contact")}>
        to-contact
      </button>
      <OnboardingProfileForm
        page={page}
        onPage={setPage}
        onRestart={onRestart}
        onNext={onNext}
        progressTotal={5}
        initialValues={initialValues}
        initialAvatarFile={initialAvatarFile}
      />
    </>
  );
}

function renderForm(
  onNext: (data: ProfileInput, avatarFile: File) => void = vi.fn(),
  initialValues?: ProfileInput,
  initialAvatarFile?: File,
  {
    startPage = "profile",
    onRestart = vi.fn(),
  }: { startPage?: ProfilePage; onRestart?: () => void } = {},
) {
  return render(
    <Harness
      onNext={onNext}
      onRestart={onRestart}
      initialValues={initialValues}
      initialAvatarFile={initialAvatarFile}
      startPage={startPage}
    />,
  );
}

const page = () => screen.getByTestId("page").textContent;

async function pressContinue() {
  await act(async () => {
    fireEvent.submit(screen.getByRole("form"));
  });
}

const textbox = (name: RegExp | string) => screen.getByRole("textbox", { name });

/** Fills each page with the least it needs and continues past it. */
async function completeProfilePage(name = "Alice") {
  fireEvent.change(textbox(/^name$/i), { target: { value: name } });
  await pressContinue();
}
async function completeContactPage(email = "alice@example.com") {
  fireEvent.change(textbox(/email/i), { target: { value: email } });
  await pressContinue();
}

const PROFILE: ProfileInput = {
  name: "Alice",
  email: "alice@example.com",
  phone: "",
  preferredCurrency: "KES",
  bio: "Neighbourhood organiser",
  // The URL stub in beforeEach replaces the constructor zod's URL check uses.
  website: "",
  location: {
    lat: -1.2921,
    lng: 36.8219,
    locationName: "Nairobi, Kenya",
    country: "KE",
  },
};

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:preview"),
    revokeObjectURL: vi.fn(),
  });
  mockNavigate.mockClear();
  mockResolveProfileCountry.mockReset();
  mockResolveProfileCountry.mockResolvedValue("US");
});

describe("OnboardingProfileForm pages", () => {
  it("asks for the photo, name and username first, with sign-in one link away", () => {
    renderForm();
    expect(screen.getByRole("button", { name: /add a photo/i })).toBeTruthy();
    expect(textbox(/^name$/i)).toBeTruthy();
    expect(textbox(/^username$/i)).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /email/i })).toBeNull();
    expect(screen.queryByTestId("location-picker")).toBeNull();
    const signIn = screen.getByRole("link", { name: /go back to sign in/i });
    expect(signIn.getAttribute("href")).toContain("step=signin");
    expect(screen.getByRole("link", { name: "Back" })).toBeTruthy();
    expect(screen.getByTestId("step-progress")).toBeTruthy();
    expect(screen.getByRole("button", { name: /continue/i })).toBeTruthy();
  });

  it("asks for email, phone, website and bio on Contact", () => {
    renderForm(vi.fn(), PROFILE, PHOTO, { startPage: "contact" });
    expect(textbox(/email/i)).toBeTruthy();
    expect(screen.getByTestId("phone-input")).toBeTruthy();
    expect(textbox(/website/i)).toBeTruthy();
    expect(textbox(/bio/i)).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /^name$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /go back to sign in/i })).toBeNull();
  });

  it("asks for the place on Location, with the currency as a row", () => {
    renderForm(vi.fn(), PROFILE, PHOTO, { startPage: "location" });
    expect(screen.getByTestId("location-picker")).toBeTruthy();
    expect(textbox("Location").getAttribute("aria-required")).toBe("true");
    const currency = screen.getByRole("button", { name: /preferred currency/i });
    expect(currency.textContent).toContain("KES");
    expect(screen.queryByRole("combobox", { name: /preferred currency/i })).toBeNull();
  });

  it("opens the currency picker in a sheet from its row", async () => {
    renderForm(vi.fn(), PROFILE, PHOTO, { startPage: "location" });
    fireEvent.click(screen.getByRole("button", { name: /preferred currency/i }));
    expect(await screen.findByRole("dialog", { name: "Preferred currency" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /preferred currency/i })).toBeTruthy();
  });

  it("sends a later page opened with an empty form back to the start", () => {
    const onRestart = vi.fn();
    renderForm(vi.fn(), undefined, undefined, { startPage: "location", onRestart });
    expect(onRestart).toHaveBeenCalledOnce();
  });

  it("keeps a later page whose earlier pages are filled in", () => {
    const onRestart = vi.fn();
    renderForm(vi.fn(), PROFILE, PHOTO, { startPage: "location", onRestart });
    expect(onRestart).not.toHaveBeenCalled();
  });
});

describe("OnboardingProfileForm Continue", () => {
  it("focuses and centers the missing photo after an empty Continue", async () => {
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView");
    renderForm();

    await pressContinue();

    const photo = screen.getByRole("button", { name: /add a photo/i });
    await waitFor(() => expect(document.activeElement).toBe(photo));
    expect(photo.getAttribute("aria-invalid")).toBe("true");
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "center", inline: "nearest" }),
    );
    expect(page()).toBe("profile");
  });

  it("focuses the name when a photo is present, with a short Required", async () => {
    renderForm(vi.fn(), undefined, PHOTO);

    await pressContinue();

    const name = textbox(/^name$/i);
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(name.parentElement?.textContent).toContain("Required");
    expect(screen.queryByText("Name is required")).toBeNull();
    expect(page()).toBe("profile");
  });

  it("keeps the specific validation message for a name that is too long", async () => {
    renderForm(vi.fn(), undefined, PHOTO);
    fireEvent.change(textbox(/^name$/i), { target: { value: "A".repeat(81) } });
    await pressContinue();
    expect(screen.getByText("Name must be 80 characters or fewer")).toBeTruthy();
    expect(page()).toBe("profile");
  });

  it("does not advance without a photo and says so once", async () => {
    renderForm();
    fireEvent.change(textbox(/^name$/i), { target: { value: "Alice" } });
    await pressContinue();
    expect(page()).toBe("profile");
    expect(screen.getByRole("alert").textContent).toBe("Required");
    expect(screen.getByRole("button", { name: /add a photo/i }).getAttribute("aria-invalid")).toBe(
      "true",
    );
  });

  it("moves on to Contact once the photo and name are in", async () => {
    renderForm(vi.fn(), undefined, PHOTO);
    await completeProfilePage();
    expect(page()).toBe("contact");
  });

  it("opens Contact without errors from the page before it", async () => {
    renderForm(vi.fn(), undefined, PHOTO);
    await completeProfilePage();
    expect(screen.queryByText("Provide an email or phone number")).toBeNull();
    expect(textbox(/email/i).getAttribute("aria-invalid")).toBe("false");
  });

  it("keeps Contact until there is an email or a phone", async () => {
    renderForm(vi.fn(), undefined, PHOTO);
    await completeProfilePage();
    await pressContinue();
    expect(page()).toBe("contact");
    expect(screen.getByText("Provide an email or phone number")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(textbox(/email/i)));
  });

  it("blocks a consecutive-dot email and continues after it is corrected", async () => {
    renderForm(vi.fn(), undefined, PHOTO);
    await completeProfilePage();
    fireEvent.change(textbox(/email/i), { target: { value: "w..illruddick@gmail.com" } });
    await pressContinue();
    expect(page()).toBe("contact");
    expect(screen.getByText("Invalid email address")).toBeTruthy();

    fireEvent.change(textbox(/email/i), { target: { value: "w.illruddick@gmail.com" } });
    await pressContinue();
    expect(page()).toBe("location");
  });

  it("does not call onNext until a valid location is set", async () => {
    const mockOnNext = vi.fn();
    renderForm(mockOnNext, undefined, PHOTO);
    await completeProfilePage();
    await completeContactPage();
    expect(screen.queryByText(/choose a location/i)).toBeNull();

    await pressContinue();

    expect(mockOnNext).not.toHaveBeenCalled();
    expect(screen.getByText(/choose a location/i)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(textbox("Location")));
  });

  it("calls onNext with the whole validated profile from the last page", async () => {
    const mockOnNext = vi.fn();
    renderForm(mockOnNext, undefined, PHOTO);
    await completeProfilePage();
    await completeContactPage();
    fireEvent.click(screen.getByRole("button", { name: /choose location/i }));
    await pressContinue();

    expect(mockOnNext).toHaveBeenCalledWith(
      expect.objectContaining<Partial<ProfileInput>>({
        name: "Alice",
        email: "alice@example.com",
        preferredCurrency: "KES",
        bio: "",
        website: "",
        location: {
          lat: -1.2921,
          lng: 36.8219,
          locationName: "Nairobi, Kenya",
          country: "KE",
        },
      }),
      // The photo travels beside the validated profile: it cannot be part of it,
      // because profileSchema lives in @clc/core and cannot name a File.
      PHOTO,
    );
  });

  it("submits a chosen username", async () => {
    const mockOnNext = vi.fn();
    renderForm(mockOnNext, undefined, PHOTO);
    fireEvent.change(textbox(/^username$/i), { target: { value: "alice-2" } });
    await completeProfilePage();
    await completeContactPage();
    fireEvent.click(screen.getByRole("button", { name: /choose location/i }));
    await pressContinue();

    expect(mockOnNext).toHaveBeenCalledWith(
      expect.objectContaining<Partial<ProfileInput>>({ username: "alice-2" }),
      PHOTO,
    );
  });

  it("omits a blank username so signup can assign one automatically", async () => {
    const mockOnNext = vi.fn();
    renderForm(mockOnNext, undefined, PHOTO);
    await completeProfilePage();
    await completeContactPage();
    fireEvent.click(screen.getByRole("button", { name: /choose location/i }));
    await pressContinue();

    const submitted = mockOnNext.mock.calls[0]?.[0] as ProfileInput;
    expect(submitted).not.toHaveProperty("username");
  });
});

describe("OnboardingProfileForm suggestions", () => {
  it("keeps a location currency when the network suggestion arrives later", async () => {
    let resolveNetworkCountry: (country: string) => void = () => undefined;
    mockResolveProfileCountry.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveNetworkCountry = resolve;
        }),
    );
    const mockOnNext = vi.fn();
    renderForm(mockOnNext, undefined, PHOTO);
    await completeProfilePage();
    await completeContactPage();
    fireEvent.click(screen.getByRole("button", { name: /choose location/i }));

    await act(async () => {
      resolveNetworkCountry("US");
    });
    await pressContinue();

    expect(mockOnNext).toHaveBeenCalledWith(
      expect.objectContaining<Partial<ProfileInput>>({ preferredCurrency: "KES" }),
      PHOTO,
    );
  });

  it("seeds the phone dialling code from the same country as the currency", async () => {
    renderForm(vi.fn(), undefined, PHOTO);
    await completeProfilePage();

    await waitFor(() =>
      expect(screen.getByTestId("phone-input").getAttribute("data-default-country")).toBe("US"),
    );

    // A chosen location beats the network hint for both fields.
    await completeContactPage();
    fireEvent.click(screen.getByRole("button", { name: /choose location/i }));
    fireEvent.click(screen.getByRole("button", { name: "to-contact" }));
    expect(screen.getByTestId("phone-input").getAttribute("data-default-country")).toBe("KE");
  });

  it("still seeds the dialling code when a currency was already chosen", async () => {
    const mockOnNext = vi.fn();
    renderForm(
      mockOnNext,
      {
        name: "",
        email: "",
        phone: "",
        location: undefined,
        preferredCurrency: "EUR",
        bio: "",
        website: "",
      } as unknown as ProfileInput,
      PHOTO,
    );
    await completeProfilePage();

    // A saved currency preference says nothing about which dialling code to
    // start on, so the network hint still reaches the phone field.
    await waitFor(() =>
      expect(screen.getByTestId("phone-input").getAttribute("data-default-country")).toBe("US"),
    );

    await completeContactPage();
    fireEvent.click(screen.getByRole("button", { name: /choose location/i }));
    await pressContinue();

    // A location picked afterwards does not override the chosen currency either.
    expect(mockOnNext).toHaveBeenCalledWith(
      expect.objectContaining<Partial<ProfileInput>>({ preferredCurrency: "EUR" }),
      PHOTO,
    );
  });
});

describe("OnboardingProfileForm value restoration", () => {
  it("puts saved values back on each page", async () => {
    renderForm(vi.fn(), PROFILE, PHOTO);
    expect((textbox(/^name$/i) as HTMLInputElement).value).toBe("Alice");
    await pressContinue();
    expect((textbox(/email/i) as HTMLInputElement).value).toBe("alice@example.com");
    await pressContinue();
    expect(screen.getByText("Nairobi, Kenya")).toBeTruthy();
  });

  it("falls back to empty defaults when no initialValues are given", () => {
    renderForm();
    expect((textbox(/^name$/i) as HTMLInputElement).value).toBe("");
  });
});

describe("OnboardingProfileForm photo", () => {
  it("marks the photo Required in muted text until Continue is pressed", () => {
    renderForm();
    const photoButton = screen.getByRole("button", { name: /add a photo/i });
    const note = photoButton.parentElement?.querySelector("p");
    expect(note?.textContent).toBe("Required");
    expect(note?.className).toContain("text-muted-foreground");
  });

  it("carries the chosen photo out with the validated profile", async () => {
    const mockOnNext = vi.fn();
    renderForm(mockOnNext);

    const photo = new File([new Uint8Array(8)], "me.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Choose a profile photo"), {
      target: { files: [photo] },
    });
    // Selection opens the frame; the photo reaches the form only once framed.
    await waitFor(() => expect(document.querySelector('[role="group"] img')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Use photo" }));
    });

    await completeProfilePage();
    await completeContactPage();
    fireEvent.click(screen.getByRole("button", { name: /choose location/i }));
    await pressContinue();

    // Beside the profile, not inside it: the schema is shared with @clc/core and
    // cannot name a File. jsdom has no createImageBitmap, so the encode falls
    // back to the original file — which is the same object identity here.
    expect(mockOnNext).toHaveBeenCalledWith(expect.objectContaining({ name: "Alice" }), photo);
  });
});
