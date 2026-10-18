import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { ResourceQuotaTitle } from "./resource-usage";

describe("ResourceQuotaTitle", () => {
  it("renders finite and unlimited quotas inline without a duplicated resource prefix", () => {
    const { rerender } = render(
      <h2>
        <ResourceQuotaTitle
          quota={{ used: 1, limit: 3, unlimited: false, canCreate: true }}
          pending={false}
          error={false}
        >
          Offerings
        </ResourceQuotaTitle>
      </h2>,
    );
    expect(screen.getByRole("heading").textContent).toBe("Offerings 1 of 3 used");
    expect(screen.queryByText(/Offers:/)).toBeNull();

    rerender(
      <h2>
        <ResourceQuotaTitle
          quota={{ used: 4, limit: 0, unlimited: true, canCreate: true }}
          pending={false}
          error={false}
        >
          Offerings
        </ResourceQuotaTitle>
      </h2>,
    );
    expect(screen.getByRole("heading").textContent).toBe("Offerings 4 used · Unlimited");
  });

  it("renders loading and unavailable states inline", () => {
    const { rerender } = render(
      <h2>
        <ResourceQuotaTitle quota={undefined} pending error={false}>
          My Pools
        </ResourceQuotaTitle>
      </h2>,
    );
    expect(screen.getByRole("heading").textContent).toBe("My Pools Loading…");

    rerender(
      <h2>
        <ResourceQuotaTitle quota={undefined} pending={false} error>
          My Pools
        </ResourceQuotaTitle>
      </h2>,
    );
    expect(screen.getByRole("heading").textContent).toBe("My Pools Unavailable");
  });
});
