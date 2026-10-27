import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { ProfilePrivacyNotice } from "./profile-privacy-notice";
import { PublicContactWarning } from "./public-contact-warning";
import { PublicLocationWarning } from "./public-location-warning";

describe("privacy disclosures", () => {
  it("distinguishes private profile data from deliberately public resource data", () => {
    render(
      <>
        <ProfilePrivacyNotice />
        <PublicContactWarning />
        <PublicLocationWarning />
      </>,
    );

    expect(
      screen.getByText(/profile name, email, phone number, and saved location are not shown/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/Contact details entered here are visible to signed-in users/i),
    ).toBeTruthy();
    expect(screen.getByText(/The exact pin will be public/i)).toBeTruthy();
  });
});
