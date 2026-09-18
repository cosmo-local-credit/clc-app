let modulePromise: Promise<typeof import("#/components/install-app-dialog")> | undefined;

export function preloadInstallDialog() {
  modulePromise ??= import("#/components/install-app-dialog").catch((error: unknown) => {
    modulePromise = undefined;
    throw error;
  });
  return modulePromise;
}
