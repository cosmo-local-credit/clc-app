import { describe, expect, it } from "vite-plus/test";

import {
  formatByteSize,
  isExternalMarkdownHref,
  safeMarkdownHref,
  REPORT_ATTACHMENT_KINDS,
  REPORT_STATUSES,
  emptyReportWrite,
  formValuesToReportWrite,
  fromDateTimeLocalValue,
  isReportStatus,
  reportDraftSchema,
  reportToFormValues,
  reportWriteSchema,
  toDateTimeLocalValue,
  todayReportPeriod,
  type ReportWrite,
} from "./logic";

function write(overrides: Partial<ReportWrite> = {}): ReportWrite {
  return { ...emptyReportWrite, title: "August community harvest", ...overrides };
}

function firstError(value: ReportWrite): string | undefined {
  const result = reportWriteSchema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe("the closed sets", () => {
  // The exact set, not "at least these": a status this list gains without
  // clc-core gaining it is a filter the backend answers 400 for.
  it("holds the four workflow states in workflow order", () => {
    expect(REPORT_STATUSES).toEqual(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]);
    expect(REPORT_ATTACHMENT_KINDS).toEqual(["FILE", "EMBED"]);
  });

  it("recognises only those states", () => {
    expect(isReportStatus("SUBMITTED")).toBe(true);
    expect(isReportStatus("submitted")).toBe(false);
    expect(isReportStatus("PUBLISHED")).toBe(false);
    expect(isReportStatus(undefined)).toBe(false);
  });
});

describe("reportWriteSchema", () => {
  it("accepts a title-only post", () => {
    expect(reportWriteSchema.safeParse(write()).success).toBe(true);
  });

  it("accepts a complete document", () => {
    const complete = write({
      body: "## Harvest\n\nTwenty members took part.",
      description: "A summary shown in the Posts feed.",
      imageUrl: "https://content.example/cover.jpg",
      geoLat: -1.2864,
      geoLng: 36.8172,
      periodFrom: "2026-08-01T08:00:00.000Z",
      periodTo: "2026-08-01T12:00:00.000Z",
      hostName: "Wendo Group",
      participants: "20",
      timeTaken: "4 hours",
      tags: ["Agriculture", "Youth"],
      vouchers: [{ chainId: 42220, address: "0x0000000000000000000000000000000000000001" }],
      images: [
        {
          url: "https://content.example/one.jpg",
          width: null,
          height: null,
          maxWidth: 1440,
          maxHeight: 2160,
          byteSize: 245_761,
          caption: "Sorting the harvest",
        },
      ],
      attachments: [
        {
          kind: "FILE",
          url: "https://content.example/notes.pdf",
          filename: "notes.pdf",
          byteSize: 81_920,
        },
      ],
    });

    expect(reportWriteSchema.safeParse(complete).success).toBe(true);
  });

  it("requires a non-blank title", () => {
    expect(firstError(write({ title: "   " }))).toBe("Enter a title for your post");
  });

  it("enforces every length ceiling clc-core enforces", () => {
    expect(firstError(write({ title: "x".repeat(201) }))).toBe(
      "Title must be 200 characters or fewer",
    );
    expect(firstError(write({ body: "x".repeat(500_001) }))).toBe("Post text is too long");
    expect(firstError(write({ description: "x".repeat(10_001) }))).toBe(
      "Summary must be 10,000 characters or fewer",
    );
    expect(firstError(write({ hostName: "x".repeat(201) }))).toBe(
      "Host must be 200 characters or fewer",
    );
    expect(firstError(write({ participants: "x".repeat(101) }))).toBe(
      "Participants must be 100 characters or fewer",
    );
    expect(firstError(write({ timeTaken: "x".repeat(101) }))).toBe(
      "Duration must be 100 characters or fewer",
    );
  });

  it("enforces every collection ceiling", () => {
    expect(firstError(write({ tags: Array.from({ length: 13 }, (_, i) => `Tag ${i}`) }))).toBe(
      "Choose at most 12 tags",
    );
    expect(
      firstError(
        write({
          vouchers: Array.from({ length: 13 }, (_, index) => ({
            chainId: 42220,
            address: `0x${String(index).padStart(40, "0")}`,
          })),
        }),
      ),
    ).toBe("Link at most 12 vouchers");
    expect(
      firstError(
        write({
          images: Array.from({ length: 51 }, (_, index) => ({
            url: `https://content.example/${index}.jpg`,
            width: null,
            height: null,
            maxWidth: null,
            maxHeight: null,
            byteSize: null,
            caption: null,
          })),
        }),
      ),
    ).toBe("Add at most 50 images");
    expect(
      firstError(
        write({
          attachments: Array.from({ length: 21 }, (_, index) => ({
            kind: "EMBED" as const,
            url: `https://content.example/${index}`,
            filename: null,
            byteSize: null,
          })),
        }),
      ),
    ).toBe("Add at most 20 attachments");
  });

  it("rejects media that is not an http(s) URL", () => {
    for (const url of ["data:image/png;base64,abc", "ftp://example.org/a.pdf", "/relative.jpg"]) {
      expect(firstError(write({ imageUrl: url }))).toBe("Media must be an uploaded http(s) URL");
    }
  });

  it("requires both halves of a coordinate", () => {
    expect(firstError(write({ geoLat: -1.2864 }))).toBe("Choose a place on the map or clear it");
    expect(firstError(write({ geoLng: 36.8172 }))).toBe("Choose a place on the map or clear it");
    expect(reportWriteSchema.safeParse(write({ geoLat: -1.2864, geoLng: 36.8172 })).success).toBe(
      true,
    );
  });

  it("bounds coordinates", () => {
    expect(firstError(write({ geoLat: 91, geoLng: 0 }))).toBe(
      "Latitude must be between -90 and 90",
    );
    expect(firstError(write({ geoLat: 0, geoLng: -181 }))).toBe(
      "Longitude must be between -180 and 180",
    );
  });

  it("requires the period to run forwards, and allows an open end", () => {
    expect(
      firstError(
        write({ periodFrom: "2026-08-02T08:00:00.000Z", periodTo: "2026-08-01T08:00:00.000Z" }),
      ),
    ).toBe("The end of the period must not be before its start");
    // Equal ends are one-day posts, which 778 of the imported reports are.
    expect(
      reportWriteSchema.safeParse(
        write({ periodFrom: "2026-08-01T08:00:00.000Z", periodTo: "2026-08-01T08:00:00.000Z" }),
      ).success,
    ).toBe(true);
    expect(
      reportWriteSchema.safeParse(write({ periodFrom: "2026-08-01T08:00:00.000Z" })).success,
    ).toBe(true);
  });

  it("rejects a period value that is not a timestamp", () => {
    expect(firstError(write({ periodFrom: "last August" }))).toBe("Enter a valid date and time");
  });

  // clc-core answers 400 for a duplicate in any of the four collections, so all
  // four are rejected here rather than deduplicated in some and not others.
  it("rejects duplicates in every collection", () => {
    expect(firstError(write({ tags: ["Youth", "Youth"] }))).toBe("Each tag can only be added once");
    expect(
      firstError(
        write({
          vouchers: [
            { chainId: 42220, address: "0x000000000000000000000000000000000000000a" },
            { chainId: 42220, address: "0x000000000000000000000000000000000000000A" },
          ],
        }),
      ),
    ).toBe("Each voucher can only be linked once");
    expect(
      firstError(
        write({
          images: [
            {
              url: "https://content.example/a.jpg",
              width: null,
              height: null,
              maxWidth: null,
              maxHeight: null,
              byteSize: null,
              caption: null,
            },
            {
              url: "https://content.example/a.jpg",
              width: null,
              height: null,
              maxWidth: null,
              maxHeight: null,
              byteSize: 12,
              caption: "Same URL",
            },
          ],
        }),
      ),
    ).toBe("Each image can only be added once");
    expect(
      firstError(
        write({
          attachments: [
            { kind: "FILE", url: "https://content.example/a.pdf", filename: null, byteSize: null },
            {
              kind: "FILE",
              url: "https://content.example/a.pdf",
              filename: "a.pdf",
              byteSize: null,
            },
          ],
        }),
      ),
    ).toBe("Each attachment can only be added once");
  });

  // One URL can be both a download and a player reference: two rows, not a
  // duplicate.
  it("keeps attachment kinds apart", () => {
    const both = write({
      attachments: [
        { kind: "FILE", url: "https://content.example/clip.mp4", filename: null, byteSize: null },
        { kind: "EMBED", url: "https://content.example/clip.mp4", filename: null, byteSize: null },
      ],
    });
    expect(reportWriteSchema.safeParse(both).success).toBe(true);
  });
});

describe("formValuesToReportWrite", () => {
  // TanStack Form submits the caller's values, so trimming has to happen here or
  // padded text travels to the database.
  it("normalizes the text that was validated", () => {
    const normalized = formValuesToReportWrite(
      write({
        title: "  August community harvest  ",
        description: "  A summary  ",
        hostName: "  Wendo Group  ",
        tags: ["  Youth  "],
        imageUrl: "  https://content.example/cover.jpg  ",
      }),
    );

    expect(normalized.title).toBe("August community harvest");
    expect(normalized.description).toBe("A summary");
    expect(normalized.hostName).toBe("Wendo Group");
    expect(normalized.tags).toEqual(["Youth"]);
    expect(normalized.imageUrl).toBe("https://content.example/cover.jpg");
  });

  it("throws on an invalid document rather than sending it", () => {
    expect(() => formValuesToReportWrite(write({ title: "" }))).toThrow();
  });
});

describe("reportToFormValues", () => {
  // PUT is assign-all, so a field this drops is a field the next save erases.
  it("hydrates every field the server will replace", () => {
    const values = reportToFormValues({
      title: "Imported post",
      body: "## Body",
      description: "Summary",
      imageUrl: "https://content.example/cover.jpg",
      lat: -1.2864,
      lng: 36.8172,
      periodFrom: "2026-08-01T08:00:00Z",
      periodTo: "2026-08-01T12:00:00Z",
      hostName: "Wendo Group",
      participants: "20",
      timeTaken: "4 hours",
      tags: ["Agriculture"],
      vouchers: [{ chainId: 42220, address: "0x0000000000000000000000000000000000000001" }],
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
      ],
    });

    expect(values).toEqual({
      title: "Imported post",
      body: "## Body",
      description: "Summary",
      imageUrl: "https://content.example/cover.jpg",
      geoLat: -1.2864,
      geoLng: 36.8172,
      periodFrom: "2026-08-01T08:00:00Z",
      periodTo: "2026-08-01T12:00:00Z",
      hostName: "Wendo Group",
      participants: "20",
      timeTaken: "4 hours",
      tags: ["Agriculture"],
      vouchers: [{ chainId: 42220, address: "0x0000000000000000000000000000000000000001" }],
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
      ],
    });
  });

  it("turns a bare row into a blank form", () => {
    expect(reportToFormValues({ title: "Bare" })).toEqual({ ...emptyReportWrite, title: "Bare" });
  });

  it("round-trips a stored post through validation", () => {
    const values = reportToFormValues({
      title: "Round trip",
      tags: ["Youth"],
      images: [
        {
          url: "https://content.example/one.jpg",
          width: null,
          height: null,
          maxWidth: null,
          maxHeight: null,
          byteSize: null,
          caption: null,
        },
      ],
    });
    expect(reportWriteSchema.safeParse(values).success).toBe(true);
  });
});

describe("datetime-local conversion", () => {
  it("round-trips a wall-clock moment", () => {
    const local = toDateTimeLocalValue(new Date(2026, 7, 1, 8, 30).toISOString());
    expect(local).toBe("2026-08-01T08:30");
    expect(new Date(fromDateTimeLocalValue(local)).getTime()).toBe(
      new Date(2026, 7, 1, 8, 30).getTime(),
    );
  });

  it("treats empty and unparseable input as unset", () => {
    expect(toDateTimeLocalValue("")).toBe("");
    expect(toDateTimeLocalValue("not a date")).toBe("");
    expect(fromDateTimeLocalValue("")).toBe("");
    expect(fromDateTimeLocalValue("   ")).toBe("");
    expect(fromDateTimeLocalValue("not a date")).toBe("");
  });
});

describe("safeMarkdownHref", () => {
  it("keeps relative links and the three allowed schemes", () => {
    for (const href of [
      "#section",
      "/posts/4633",
      "./notes.md",
      "../index.md",
      "https://example.org/a",
      "http://example.org/a",
      "mailto:someone@example.org",
      "MAILTO:someone@example.org",
    ]) {
      expect(safeMarkdownHref(href)).toBe(href.trim());
    }
  });

  // A post body is user-generated content and the renderer does not claim to be
  // a complete sanitizer for it.
  it("drops every other scheme, including obfuscated ones", () => {
    for (const href of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "java\nscript:alert(1)",
      "java\u0000script:alert(1)",
      " javascript :alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
      "tel:+254700000000",
      "file:///etc/passwd",
      "",
      "   ",
    ]) {
      expect(safeMarkdownHref(href)).toBeUndefined();
    }
    expect(safeMarkdownHref(undefined)).toBeUndefined();
  });

  it("separates links that leave the app from in-app ones", () => {
    expect(isExternalMarkdownHref("https://example.org")).toBe(true);
    expect(isExternalMarkdownHref("mailto:someone@example.org")).toBe(true);
    expect(isExternalMarkdownHref("/posts/4633")).toBe(false);
    expect(isExternalMarkdownHref("#section")).toBe(false);
  });
});

describe("formatByteSize", () => {
  it("scales to the nearest sensible unit", () => {
    expect(formatByteSize(512)).toBe("512 B");
    expect(formatByteSize(1024)).toBe("1 KB");
    expect(formatByteSize(81_920)).toBe("80 KB");
    expect(formatByteSize(245_761)).toBe("240 KB");
    expect(formatByteSize(1_572_864)).toBe("1.5 MB");
  });

  // A row with no recorded size shows no size, rather than "0 B".
  it("has nothing to say about a missing or impossible size", () => {
    expect(formatByteSize(null)).toBeNull();
    expect(formatByteSize(0)).toBeNull();
    expect(formatByteSize(-1)).toBeNull();
    expect(formatByteSize(Number.NaN)).toBeNull();
  });
});

describe("an unfinished draft", () => {
  // What a draft is judged on is its shape, not its readiness: the editor parks
  // one on every keystroke, long before it could pass the write schema.
  it("accepts a post that is not ready to send", () => {
    const partial = write({
      title: "",
      periodFrom: "2026-08-02T08:00:00.000Z",
      periodTo: "2026-08-01T08:00:00.000Z",
    });

    expect(reportWriteSchema.safeParse(partial).success).toBe(false);
    expect(reportDraftSchema.safeParse(partial).success).toBe(true);
  });

  it("still refuses a document of the wrong shape", () => {
    expect(reportDraftSchema.safeParse({ ...write(), tags: "Youth" }).success).toBe(false);
    expect(reportDraftSchema.safeParse({ title: "Only a title" }).success).toBe(false);
  });
});

describe("todayReportPeriod", () => {
  it("spans the local day, to the minute a datetime-local input can hold", () => {
    const period = todayReportPeriod(new Date(2026, 7, 20, 14, 32, 17));
    const from = new Date(period.periodFrom);
    const to = new Date(period.periodTo);

    expect([from.getFullYear(), from.getMonth(), from.getDate()]).toEqual([2026, 7, 20]);
    expect([from.getHours(), from.getMinutes(), from.getSeconds()]).toEqual([0, 0, 0]);
    expect([to.getFullYear(), to.getMonth(), to.getDate()]).toEqual([2026, 7, 20]);
    expect([to.getHours(), to.getMinutes(), to.getSeconds()]).toEqual([23, 59, 0]);
    // The pair a new post starts with must pass the write schema unchanged.
    expect(reportWriteSchema.safeParse(write(period)).success).toBe(true);
    // And survive the round trip through the inputs it is bound to.
    expect(fromDateTimeLocalValue(toDateTimeLocalValue(period.periodTo))).toBe(period.periodTo);
  });
});
