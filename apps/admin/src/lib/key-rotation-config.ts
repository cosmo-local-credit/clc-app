/** Enable only after clc-core's key rotation (migration 069) is deployed to that environment. */
export const KEY_ROTATION_ENABLED = import.meta.env.VITE_KEY_ROTATION_ENABLED === "true";
