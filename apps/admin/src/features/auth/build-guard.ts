/**
 * Refuses to produce a production build while admin authentication is stubbed.
 *
 * The stub session (see admin-session.ts) authenticates nobody. Shipping it would
 * expose every operator surface to anyone who can reach the deployment, and it
 * would do so silently — the console looks signed in. A lint rule or a code
 * comment cannot prevent that; failing the build can.
 *
 * Imported by apps/admin/vite.config.ts, so this module must stay dependency-free
 * and must not import anything browser-only.
 */

export const STUB_AUTH_ENV_VAR = "VITE_ADMIN_STUB_AUTH";

export class StubAuthInProductionBuildError extends Error {
  constructor() {
    super(
      `Refusing to build: admin authentication is stubbed (${STUB_AUTH_ENV_VAR}=true).\n` +
        "The stub session authenticates nobody, so a production build would expose every " +
        "operator surface.\n" +
        "This guard is lifted by implementing a real operator session — see " +
        "docs/admin-architecture.md, Track B1.",
    );
    this.name = "StubAuthInProductionBuildError";
  }
}

export function isStubAuthEnabled(env: Record<string, string | undefined>): boolean {
  return env[STUB_AUTH_ENV_VAR] === "true";
}

/**
 * Throws when a production build would ship stub authentication.
 *
 * Only `command === "build"` in a non-development mode is guarded. `vp dev` and
 * test runs are expected to use the stub, and a `mode: "development"` build is
 * treated as deliberate local verification rather than a release artifact.
 */
export function assertAuthIsDeployable({
  command,
  mode,
  env,
}: {
  command: "build" | "serve";
  mode: string;
  env: Record<string, string | undefined>;
}): void {
  if (command !== "build") return;
  if (mode === "development" || mode === "test") return;
  if (!isStubAuthEnabled(env)) return;
  throw new StubAuthInProductionBuildError();
}
