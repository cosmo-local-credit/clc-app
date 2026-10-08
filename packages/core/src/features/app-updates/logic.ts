import { z } from "zod";

/**
 * Build identity for one app deployment.
 *
 * The same object is inlined into the client, SSR and (on web) the service
 * worker, and published uncached at {@link APP_BUILD_INFO_PATH} by the
 * deployment that produced it. A running page compares the copy it was built
 * with against the one its origin serves now.
 *
 * - `buildId` is a digest of the build's inputs — app and shared source trees,
 *   lockfile, release entry, public configuration — so an identical rebuild or a
 *   commit outside those inputs keeps it. It is compared for equality only.
 * - `buildNumber` is a release milestone, bumped only when a release must be
 *   selectable as a minimum. It is compared numerically, and only against
 *   `minimumBuild`.
 * - `gitSha`, `builtAt` and `dirty` are diagnostics and take part in neither.
 *
 * `tooling/build-info.ts` validates every build's identity against this schema
 * before inlining or publishing it.
 */
export const APP_BUILD_INFO_PATH = "/build-info.json";

export const appBuildInfoSchema = z
  .object({
    schemaVersion: z.literal(1),
    app: z.enum(["web", "admin"]),
    /** The deploy brand, or `development` for a dev server. */
    environment: z.enum(["prod", "staging", "development"]),
    chainId: z.number().int().positive(),
    version: z.string().min(1),
    buildNumber: z.number().int().positive(),
    minimumBuild: z.number().int().nonnegative(),
    gitSha: z.union([z.string().regex(/^[0-9a-f]{40}$/), z.literal("unknown")]),
    dirty: z.boolean(),
    builtAt: z.iso.datetime(),
    buildId: z.string().regex(/^[0-9a-f]{64}$/),
  })
  // A floor above the deployment publishing it can never be met by updating,
  // so a page that trusted it would ask for an update that cannot arrive.
  .refine((info) => info.minimumBuild <= info.buildNumber, {
    message: "minimumBuild exceeds the buildNumber of the deployment publishing it",
    path: ["minimumBuild"],
  });

export type AppBuildInfo = z.infer<typeof appBuildInfoSchema>;

export type AppUpdateStatus =
  /** The origin serves this build, or a descriptor this page cannot use. */
  | { kind: "current" }
  /** A different deployment is live and this build is still supported. */
  | { kind: "available"; target: AppBuildInfo }
  /** This build is below the live deployment's minimum. */
  | { kind: "required"; target: AppBuildInfo };

/**
 * What the running build should tell its user about the deployment its origin
 * serves now.
 *
 * A descriptor for another app, environment or chain is ignored rather than
 * acted on: following it would move a user between deployments they did not
 * choose. `enforceMinimum` is false on preview hosts, which still offer
 * advisory updates from their own origin but never a required one.
 */
export function evaluateAppUpdate(
  loaded: AppBuildInfo,
  live: AppBuildInfo,
  { enforceMinimum }: { enforceMinimum: boolean },
): AppUpdateStatus {
  if (
    live.app !== loaded.app ||
    live.environment !== loaded.environment ||
    live.chainId !== loaded.chainId
  ) {
    return { kind: "current" };
  }
  if (enforceMinimum && loaded.buildNumber < live.minimumBuild) {
    return { kind: "required", target: live };
  }
  if (live.buildId !== loaded.buildId) {
    return { kind: "available", target: live };
  }
  return { kind: "current" };
}
