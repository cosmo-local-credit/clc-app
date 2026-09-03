import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { emptyReportWrite, type ReportWrite } from "@clc/core/features/reports/logic";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createHttpClient } from "../../client/http-client";
import {
  REPORT_PAYLOAD_MAX_BYTES,
  ReportPayloadTooLargeError,
  createReportsClient,
  serializeReportWrite,
} from "./client";

// One client over a test base URL. `fetch` is left to the platform so the
// existing vi.stubGlobal("fetch") in each test is what answers the request.
const api = createReportsClient(createHttpClient({ baseUrl: "https://api.test" }));

const EMPTY_FILTER: CatalogFilter = {
  term: "",
  tags: [],
  tagMatch: "any",
  vouchers: [],
  voucherMatch: "any",
};

function mockFetch(result: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, result })),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getFilteredReports", () => {
  it("serializes stable voucher identities and all-match with the cursor", async () => {
    const fetcher = mockFetch({ reports: [] });
    vi.stubGlobal("fetch", fetcher);

    await api.getFilteredReports({
      perPage: 100,
      cursor: { updatedAt: "2026-08-03T12:00:00Z", id: "90" },
      facets: true,
      filter: {
        ...EMPTY_FILTER,
        vouchers: [
          { chainId: 1, address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
          { chainId: 42220, address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
        ],
        voucherMatch: "all",
      },
    });

    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.searchParams.get("vouchers")).toBe(
      "1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,42220:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
    expect(url.searchParams.get("voucherMatch")).toBe("all");
    expect(url.searchParams.get("cursorUpdatedAt")).toBe("2026-08-03T12:00:00Z");
    expect(url.searchParams.get("cursorId")).toBe("90");
    expect(url.searchParams.get("facets")).toBe("true");
  });

  it("normalizes report relationships and voucher facets while dropping malformed rows", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        reports: [
          {
            id: 90,
            title: "Harvest",
            vouchers: [
              {
                id: 17,
                chainId: 42220,
                address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                name: "Sarafu",
                symbol: "SRF",
              },
              { id: 18, chainId: 42220, address: "bad", name: "Bad", symbol: "BAD" },
              // A write sends {chainId, address} back, so a row missing either
              // is unusable rather than partially displayable.
              {
                address: "0xcccccccccccccccccccccccccccccccccccccccc",
                name: "No id",
                symbol: "NID",
              },
            ],
          },
        ],
        voucherFacets: [
          {
            chainId: 42220,
            address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            name: "Sarafu",
            symbol: "SRF",
            count: 4,
          },
          {
            id: 18,
            chainId: 42220,
            address: "bad",
            name: "Bad",
            symbol: "BAD",
            count: 1,
          },
          {
            chainId: 42220.5,
            address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            name: "Fractional",
            symbol: "BAD",
            count: 1,
          },
        ],
      }),
    );

    const page = await api.getFilteredReports({ perPage: 100, filter: EMPTY_FILTER });

    expect(page.reports[0]?.vouchers).toEqual([
      {
        id: "17",
        chainId: 42220,
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        name: "Sarafu",
        symbol: "SRF",
      },
    ]);
    expect(page.voucherFacets).toEqual([
      {
        chainId: 42220,
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        name: "Sarafu",
        symbol: "SRF",
        count: 4,
      },
    ]);
  });
});

function write(overrides: Partial<ReportWrite> = {}): ReportWrite {
  return { ...emptyReportWrite, title: "August community harvest", ...overrides };
}

const MANAGED_ROW = {
  id: 4633,
  title: "August community harvest",
  body: "## Harvest",
  description: "Summary",
  status: "SUBMITTED",
  authorAddress: "0xAbC0000000000000000000000000000000000123",
  createdAt: "2026-08-20T10:00:00Z",
  updatedAt: "2026-08-20T10:00:00Z",
  tags: ["Youth"],
  vouchers: [],
  images: [],
  attachments: [],
};

describe("serializeReportWrite", () => {
  // PUT is assign-all, so a key this omits is a field the server clears.
  it("sends every editable key and all four collections", () => {
    const body = JSON.parse(serializeReportWrite(write()));

    expect(Object.keys(body).sort()).toEqual(
      [
        "attachments",
        "body",
        "description",
        "geoLat",
        "geoLng",
        "hostName",
        "imageUrl",
        "images",
        "participants",
        "periodFrom",
        "periodTo",
        "tags",
        "timeTaken",
        "title",
        "vouchers",
      ].sort(),
    );
    // Empty values chosen by the form travel as explicit nulls and empty arrays,
    // not as absent keys.
    expect(body.hostName).toBeNull();
    expect(body.periodFrom).toBeNull();
    expect(body.imageUrl).toBeNull();
    expect(body.tags).toEqual([]);
    expect(body.images).toEqual([]);
    expect(body.attachments).toEqual([]);
  });

  it("keeps every field of a complete document", () => {
    const body = JSON.parse(
      serializeReportWrite(
        write({
          body: "## Harvest",
          description: "Summary",
          imageUrl: "https://content.example/cover.jpg",
          geoLat: -1.2864,
          geoLng: 36.8172,
          periodFrom: "2026-08-01T08:00:00.000Z",
          periodTo: "2026-08-01T12:00:00.000Z",
          hostName: "Wendo Group",
          participants: "20",
          timeTaken: "4 hours",
          tags: ["Agriculture", "Youth"],
          vouchers: [{ chainId: 100, address: "0x0000000000000000000000000000000000000001" }],
          images: [
            {
              url: "https://content.example/one.jpg",
              width: null,
              height: null,
              maxWidth: 1440,
              maxHeight: 2160,
              byteSize: 245_761,
              caption: "Sorting",
            },
          ],
          attachments: [
            {
              kind: "EMBED",
              url: "https://content.example/clip",
              filename: null,
              byteSize: null,
            },
          ],
        }),
      ),
    );

    expect(body.vouchers).toEqual([
      { chainId: 100, address: "0x0000000000000000000000000000000000000001" },
    ]);
    expect(body.images[0]).toEqual({
      url: "https://content.example/one.jpg",
      width: null,
      height: null,
      maxWidth: 1440,
      maxHeight: 2160,
      byteSize: 245_761,
      caption: "Sorting",
    });
    expect(body.attachments[0]).toEqual({
      kind: "EMBED",
      url: "https://content.example/clip",
      filename: null,
      byteSize: null,
    });
  });

  it("re-runs the schema so the text that validated is the text that is sent", () => {
    const body = JSON.parse(serializeReportWrite(write({ title: "  Padded  " })));
    expect(body.title).toBe("Padded");
    expect(() => serializeReportWrite(write({ title: "  " }))).toThrow();
  });

  // A character count is not a byte count. This body is well inside the
  // schema's 500,000-character ceiling and still over the 1 MB request limit,
  // which is the case a length check cannot see.
  it("measures UTF-8 bytes rather than characters", () => {
    const multibyte = "अ".repeat(400_000);
    expect(multibyte.length).toBeLessThan(REPORT_PAYLOAD_MAX_BYTES);

    let thrown: unknown;
    try {
      serializeReportWrite(write({ body: multibyte }));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ReportPayloadTooLargeError);
    expect((thrown as ReportPayloadTooLargeError).byteSize).toBeGreaterThan(
      REPORT_PAYLOAD_MAX_BYTES,
    );
  });

  // The limit covers the whole request, so relations count towards it too.
  it("counts relations towards the limit, not just the text", () => {
    const images = Array.from({ length: 50 }, (_, index) => ({
      url: `https://content.example/${"x".repeat(14_000)}-${index}.jpg`,
      width: null,
      height: null,
      maxWidth: null,
      maxHeight: null,
      byteSize: null,
      caption: "y".repeat(500),
    }));

    expect(() => serializeReportWrite(write({ body: "x".repeat(450_000), images }))).toThrow(
      ReportPayloadTooLargeError,
    );
    // The same relations without the prose are inside the limit, so it is the
    // total that is being measured and not the image count.
    expect(() => serializeReportWrite(write({ images: images.slice(0, 10) }))).not.toThrow();
  });
});

describe("management reads", () => {
  it("serializes status, filters, the cursor pair and the direction", async () => {
    const fetcher = mockFetch({ reports: [], first: null, last: null });
    vi.stubGlobal("fetch", fetcher);

    await api.getAdminReports({
      perPage: 25,
      status: "SUBMITTED",
      cursor: { updatedAt: "2026-08-03T12:00:00Z", id: "90" },
      next: false,
      author: "0xAbC0000000000000000000000000000000000123",
      filter: {
        ...EMPTY_FILTER,
        term: "harvest",
        tags: ["Youth", "Agriculture"],
        tagMatch: "all",
      },
    });

    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/v2/admin/reports");
    expect(url.searchParams.get("perPage")).toBe("25");
    expect(url.searchParams.get("status")).toBe("SUBMITTED");
    expect(url.searchParams.get("q")).toBe("harvest");
    expect(url.searchParams.get("tags")).toBe("Youth,Agriculture");
    expect(url.searchParams.get("tagMatch")).toBe("all");
    expect(url.searchParams.get("cursorUpdatedAt")).toBe("2026-08-03T12:00:00Z");
    expect(url.searchParams.get("cursorId")).toBe("90");
    expect(url.searchParams.get("next")).toBe("false");
    expect(url.searchParams.get("author")).toBe("0xAbC0000000000000000000000000000000000123");
  });

  // clc-core rejects a direction with no position, and an `author` on the
  // author route would be a way to ask for someone else's drafts.
  it("omits the direction without a cursor and the author on the own-posts route", async () => {
    const fetcher = mockFetch({ reports: [], first: null, last: null });
    vi.stubGlobal("fetch", fetcher);

    await api.getMyReports({
      perPage: 20,
      next: true,
      author: "0x0000000000000000000000000000000000000009",
    });

    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/v2/users/me/reports");
    expect(url.searchParams.has("next")).toBe(false);
    expect(url.searchParams.has("author")).toBe(false);
  });

  it("returns both edge cursors and reports what normalization dropped", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        reports: [
          MANAGED_ROW,
          // No status: a queue row that cannot say its state is unusable, and
          // the count is what surfaces the gap.
          { id: 4634, title: "Statusless" },
        ],
        first: { updatedAt: "2026-08-20T10:00:00Z", id: 4633 },
        last: { updatedAt: "2026-08-02T09:12:41Z", id: 4102 },
      }),
    );

    const page = await api.getAdminReports({ perPage: 20 });

    expect(page.reports).toHaveLength(1);
    expect(page.receivedCount).toBe(2);
    expect(page.reports[0]?.status).toBe("SUBMITTED");
    expect(page.first).toEqual({ updatedAt: "2026-08-20T10:00:00Z", id: "4633" });
    expect(page.last).toEqual({ updatedAt: "2026-08-02T09:12:41Z", id: "4102" });
  });

  it("normalizes a complete detail without dropping an assign-all field", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        report: {
          ...MANAGED_ROW,
          geoLat: -1.2864,
          geoLng: 36.8172,
          periodFrom: "2026-08-01T08:00:00Z",
          periodTo: "2026-08-01T12:00:00Z",
          hostName: "Wendo Group",
          participants: "20",
          timeTaken: "4 hours",
          vouchers: [
            {
              id: 17,
              chainId: 100,
              address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              name: "Sarafu",
              symbol: "SRF",
            },
          ],
          images: [
            {
              url: "https://content.example/one.jpg",
              width: 267,
              height: 1000,
              maxWidth: 1600,
              maxHeight: 747,
              byteSize: 245_761,
              caption: "Sorting",
            },
          ],
          attachments: [
            {
              kind: "FILE",
              url: "https://content.example/notes.pdf",
              filename: "notes.pdf",
              byteSize: 81_920,
            },
            // Neither an uploaded file nor an embed, so it is not a row this
            // client can send back.
            { kind: "VIDEO", url: "https://content.example/clip.mp4" },
          ],
        },
      }),
    );

    const report = await api.getAdminReport("4633");

    expect(report.body).toBe("## Harvest");
    expect(report.status).toBe("SUBMITTED");
    expect(report.hostName).toBe("Wendo Group");
    expect(report.participants).toBe("20");
    expect(report.timeTaken).toBe("4 hours");
    expect(report.vouchers[0]?.chainId).toBe(100);
    expect(report.images[0]).toEqual({
      url: "https://content.example/one.jpg",
      width: 267,
      height: 1000,
      maxWidth: 1600,
      maxHeight: 747,
      byteSize: 245_761,
      caption: "Sorting",
    });
    expect(report.attachments).toEqual([
      {
        kind: "FILE",
        url: "https://content.example/notes.pdf",
        filename: "notes.pdf",
        byteSize: 81_920,
      },
    ]);
  });

  it("refuses a 2xx that carries no usable post", async () => {
    vi.stubGlobal("fetch", mockFetch({ report: { id: 4633, title: "No status" } }));
    await expect(api.getAdminReport("4633")).rejects.toThrow(/no usable post/);
  });
});

describe("mutations", () => {
  it("posts a create and reads the server's status back", async () => {
    const fetcher = mockFetch({ report: MANAGED_ROW });
    vi.stubGlobal("fetch", fetcher);

    const created = await api.createReport(write());

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.test/api/v2/reports");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).cache).toBe("no-store");
    expect(created.status).toBe("SUBMITTED");
  });

  it("puts an assign-all update", async () => {
    const fetcher = mockFetch({ report: { ...MANAGED_ROW, title: "Edited" } });
    vi.stubGlobal("fetch", fetcher);

    await api.updateReport("4633", write({ title: "Edited" }));

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.test/api/v2/reports/4633");
    expect((init as RequestInit).method).toBe("PUT");
    expect(JSON.parse((init as RequestInit).body as string).title).toBe("Edited");
  });

  it("approves with no body and returns the approved post", async () => {
    const fetcher = mockFetch({ report: { ...MANAGED_ROW, status: "APPROVED" } });
    vi.stubGlobal("fetch", fetcher);

    const approved = await api.approveReport("4633");

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.test/api/v2/reports/4633/approve");
    expect((init as RequestInit).method).toBe("PUT");
    expect((init as RequestInit).body).toBeUndefined();
    expect(approved.status).toBe("APPROVED");
  });

  it("returns the id the server deleted", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: 4633 }));
    expect(await api.deleteReport("4633")).toBe("4633");
  });

  it("rejects an oversized write before it reaches the network", async () => {
    const fetcher = mockFetch({ report: MANAGED_ROW });
    vi.stubGlobal("fetch", fetcher);

    await expect(api.createReport(write({ body: "अ".repeat(400_000) }))).rejects.toBeInstanceOf(
      ReportPayloadTooLargeError,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
