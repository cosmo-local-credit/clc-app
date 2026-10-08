import type { AppBuildInfo } from "@clc/core/features/app-updates/logic";

/** This build's identity — what the live deployment descriptor is compared with. */
export const BUILD_INFO: AppBuildInfo = __CLC_BUILD_INFO__;
