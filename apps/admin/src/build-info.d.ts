import type { AppBuildInfo } from "@clc/core/features/app-updates/logic";

declare global {
  /**
   * This build's identity, inlined by `define` in `vite.config.ts`. Read it
   * through `#/features/app-updates/build-info`.
   */
  const __CLC_BUILD_INFO__: AppBuildInfo;
}
