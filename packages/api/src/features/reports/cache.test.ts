import type { ReportStatus } from "@clc/core/features/reports/logic";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  settleReportApproval,
  settleReportCreate,
  settleReportDeletion,
  settleReportUpdate,
} from "./cache";
import type { ManagedReportDetail } from "./client";
import { reportKeys } from "./queries";

const AUTHOR = "0xAbC0000000000000000000000000000000000123";
const MANAGED = { perPage: 20, status: "SUBMITTED" as ReportStatus };

function detail(status: ReportStatus, id = "4633"): ManagedReportDetail {
  return {
    id,
    title: "August community harvest",
    description: "Summary",
    body: "## Harvest",
    imageUrl: null,
    locationName: null,
    lat: null,
    lng: null,
    periodFrom: null,
    periodTo: null,
    authorAddress: AUTHOR,
    createdAt: "2026-08-20T10:00:00Z",
    updatedAt: "2026-08-20T10:00:00Z",
    tags: [],
    vouchers: [],
    images: [],
    attachments: [],
    hostName: null,
    participants: null,
    timeTaken: null,
    status,
  };
}

/**
 * A cache holding one entry of every family, all fresh.
 *
 * `staleTime: Infinity` is what makes invalidation observable: without it every
 * entry is already stale and `isStale()` would be true whether or not the
 * settlement touched it.
 */
function seededClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY, retry: false } },
  });

  for (const key of [
    reportKeys.feed(20),
    reportKeys.list(20),
    reportKeys.filtered(null, 20),
    reportKeys.voucherFeed(undefined, 20),
    reportKeys.detail("4633"),
    reportKeys.mine(AUTHOR, MANAGED),
    reportKeys.myDetail(AUTHOR, "4633"),
    reportKeys.adminList(MANAGED),
    reportKeys.adminDetail("4633"),
    // App-private third-party lookups, under the same two-segment root. A
    // settlement that reaches these refetches a geocode on every save.
    [...reportKeys.all, "location", { lat: -1.29, lng: 36.82 }],
    reportKeys.facetVocabulary(),
  ]) {
    queryClient.setQueryData(key, { seeded: true });
  }
  return queryClient;
}

function stale(queryClient: QueryClient, key: readonly unknown[]): boolean {
  const query = queryClient.getQueryCache().find({ queryKey: key, exact: true });
  return query ? query.isStale() : false;
}

function publicListsStale(queryClient: QueryClient): boolean[] {
  return [
    reportKeys.feed(20),
    reportKeys.list(20),
    reportKeys.filtered(null, 20),
    reportKeys.voucherFeed(undefined, 20),
  ].map((key) => stale(queryClient, key));
}

function managedListsStale(queryClient: QueryClient): boolean[] {
  return [reportKeys.mine(AUTHOR, MANAGED), reportKeys.adminList(MANAGED)].map((key) =>
    stale(queryClient, key),
  );
}

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = seededClient();
});

describe("settleReportCreate", () => {
  it("seeds the managed details from the response", async () => {
    const report = detail("SUBMITTED");
    await settleReportCreate(queryClient, report, AUTHOR);

    expect(queryClient.getQueryData(reportKeys.adminDetail("4633"))).toStrictEqual(report);
    expect(queryClient.getQueryData(reportKeys.myDetail(AUTHOR, "4633"))).toStrictEqual(report);
  });

  // A SUBMITTED post is in no public list, so refetching the whole catalog for
  // a row nobody can see is pure waste.
  it("leaves the public catalog alone for a submitted post", async () => {
    await settleReportCreate(queryClient, detail("SUBMITTED"), AUTHOR);

    expect(publicListsStale(queryClient)).toEqual([false, false, false, false]);
    expect(managedListsStale(queryClient)).toEqual([true, true]);
  });

  it("never seeds the public detail for a submitted post", async () => {
    await settleReportCreate(queryClient, detail("SUBMITTED"), AUTHOR);
    expect(queryClient.getQueryData(reportKeys.detail("4633"))).toBeUndefined();
  });

  // A superadmin's post publishes immediately.
  it("invalidates the public catalog for an approved post", async () => {
    await settleReportCreate(queryClient, detail("APPROVED"), AUTHOR);

    expect(publicListsStale(queryClient)).toEqual([true, true, true, true]);
    expect(queryClient.getQueryData(reportKeys.detail("4633"))).toBeDefined();
  });
});

describe("settleReportUpdate", () => {
  it("invalidates the managed lists for any edit", async () => {
    await settleReportUpdate(queryClient, detail("SUBMITTED"), "SUBMITTED", AUTHOR);
    expect(managedListsStale(queryClient)).toEqual([true, true]);
  });

  // Nothing published changed, so the feed keeps its pages.
  it("leaves the public catalog alone for a submitted-to-submitted edit", async () => {
    await settleReportUpdate(queryClient, detail("SUBMITTED"), "SUBMITTED", AUTHOR);
    expect(publicListsStale(queryClient)).toEqual([false, false, false, false]);
  });

  // An author's edit of an approved post takes it out of the feed.
  it("invalidates the public catalog when an approved post is resubmitted", async () => {
    await settleReportUpdate(queryClient, detail("SUBMITTED"), "APPROVED", AUTHOR);

    expect(publicListsStale(queryClient)).toEqual([true, true, true, true]);
    // The record no longer exists publicly, so the approved copy is dropped
    // rather than left to be re-read.
    expect(queryClient.getQueryData(reportKeys.detail("4633"))).toBeUndefined();
  });

  // An operator's content edit stays published and still changed what readers see.
  it("invalidates the public catalog for an admin edit that remains approved", async () => {
    const report = detail("APPROVED");
    await settleReportUpdate(queryClient, report, "APPROVED", AUTHOR);

    expect(publicListsStale(queryClient)).toEqual([true, true, true, true]);
    expect(queryClient.getQueryData(reportKeys.detail("4633"))).toStrictEqual(report);
  });

  // A caller that cannot say what the post was must not be the reason published
  // content stays stale.
  it("invalidates conservatively when the previous status is unknown", async () => {
    await settleReportUpdate(queryClient, detail("SUBMITTED"), undefined, AUTHOR);
    expect(publicListsStale(queryClient)).toEqual([true, true, true, true]);
  });
});

describe("settleReportApproval", () => {
  it("seeds every detail and invalidates every list family", async () => {
    const report = detail("APPROVED");
    await settleReportApproval(queryClient, report, AUTHOR);

    expect(queryClient.getQueryData(reportKeys.detail("4633"))).toStrictEqual(report);
    expect(queryClient.getQueryData(reportKeys.adminDetail("4633"))).toStrictEqual(report);
    expect(queryClient.getQueryData(reportKeys.myDetail(AUTHOR, "4633"))).toStrictEqual(report);
    expect(publicListsStale(queryClient)).toEqual([true, true, true, true]);
    expect(managedListsStale(queryClient)).toEqual([true, true]);
  });
});

describe("settleReportDeletion", () => {
  it("removes every detail entry for the id", async () => {
    await settleReportDeletion(queryClient, "4633", "APPROVED", AUTHOR);

    expect(queryClient.getQueryData(reportKeys.detail("4633"))).toBeUndefined();
    expect(queryClient.getQueryData(reportKeys.adminDetail("4633"))).toBeUndefined();
    expect(queryClient.getQueryData(reportKeys.myDetail(AUTHOR, "4633"))).toBeUndefined();
  });

  it("removes the author's detail entry without being told which author", async () => {
    await settleReportDeletion(queryClient, "4633", "SUBMITTED");
    expect(queryClient.getQueryData(reportKeys.myDetail(AUTHOR, "4633"))).toBeUndefined();
  });

  it("leaves the public catalog alone when the deleted post was not approved", async () => {
    await settleReportDeletion(queryClient, "4633", "SUBMITTED", AUTHOR);

    expect(publicListsStale(queryClient)).toEqual([false, false, false, false]);
    expect(managedListsStale(queryClient)).toEqual([true, true]);
  });

  it("invalidates the public catalog when the deleted post was approved", async () => {
    await settleReportDeletion(queryClient, "4633", "APPROVED", AUTHOR);
    expect(publicListsStale(queryClient)).toEqual([true, true, true, true]);
  });

  it("invalidates conservatively when the previous status is unknown", async () => {
    await settleReportDeletion(queryClient, "4633", undefined, AUTHOR);
    expect(publicListsStale(queryClient)).toEqual([true, true, true, true]);
  });
});

describe("every settlement", () => {
  // `reportKeys.all` also covers apps/web's reverse-geocode entries and the
  // facet vocabulary, so no settlement may invalidate that prefix.
  it("leaves the app-private lookups under the shared prefix untouched", async () => {
    const geocode = [...reportKeys.all, "location", { lat: -1.29, lng: 36.82 }];

    for (const settle of [
      () => settleReportCreate(queryClient, detail("APPROVED"), AUTHOR),
      () => settleReportUpdate(queryClient, detail("APPROVED"), undefined, AUTHOR),
      () => settleReportApproval(queryClient, detail("APPROVED"), AUTHOR),
      () => settleReportDeletion(queryClient, "4633", undefined, AUTHOR),
    ]) {
      queryClient = seededClient();
      await settle();
      expect(stale(queryClient, geocode)).toBe(false);
      expect(stale(queryClient, reportKeys.facetVocabulary())).toBe(false);
    }
  });

  // Details are seeded from the response, so refetching them would replace a
  // known-current record with another round trip.
  it("does not invalidate the managed details it just seeded", async () => {
    await settleReportUpdate(queryClient, detail("SUBMITTED"), "SUBMITTED", AUTHOR);

    expect(stale(queryClient, reportKeys.adminDetail("4633"))).toBe(false);
    expect(stale(queryClient, reportKeys.myDetail(AUTHOR, "4633"))).toBe(false);
  });
});
