import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const query = vi.hoisted(() => ({
  data: undefined as undefined | Record<string, unknown>,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
}));

vi.mock("#/hooks/use-resource-usage", () => ({ useResourceUsage: () => query }));

import { ResourceQuotaTitle, ResourceUsage } from "./resource-usage";

beforeEach(() => {
  query.data = undefined;
  query.isError = false;
  query.isFetching = false;
  query.refetch.mockReset();
});

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

describe("ResourceUsage", () => {
  it("retries a failed resource-usage request", () => {
    query.isError = true;
    render(<ResourceUsage resource="vouchers" />);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it("shows loading only when the count was requested", () => {
    const view = render(<ResourceUsage resource="offers" />);
    expect(screen.getByRole("status").textContent).toBe("Loading…");

    view.rerender(<ResourceUsage resource="offers" count={false} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
