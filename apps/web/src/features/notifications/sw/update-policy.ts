export const SERVICE_WORKER_UPDATE_INTERVAL_MS = 60 * 60 * 1000;

interface ServiceWorkerRegistrar {
  register: () => Promise<ServiceWorkerRegistration | undefined>;
}

interface UpdatePolicyDependencies {
  createRegistrar: (scriptUrl: string, options: RegistrationOptions) => ServiceWorkerRegistrar;
  documentTarget?: EventTarget;
  isDocumentVisible?: () => boolean;
  now?: () => number;
  onUpdateError?: (error: unknown) => void;
  windowTarget?: EventTarget;
}

interface UpdatePolicyHandle {
  dispose: () => void;
}

export async function initializeServiceWorkerUpdatePolicy(
  dependencies: UpdatePolicyDependencies,
): Promise<UpdatePolicyHandle> {
  const now = dependencies.now ?? Date.now;
  const windowTarget = dependencies.windowTarget ?? window;
  const documentTarget = dependencies.documentTarget ?? document;
  const isDocumentVisible =
    dependencies.isDocumentVisible ?? (() => document.visibilityState === "visible");
  const onUpdateError =
    dependencies.onUpdateError ??
    ((error) => {
      console.error("[sw] update check failed", error);
    });

  const registrar = dependencies.createRegistrar("/sw.js", {
    scope: "/",
    type: "module",
    updateViaCache: "none",
  });
  const registration = await registrar.register();
  if (!registration) return { dispose: () => undefined };

  let lastUpdateCheckAt = now();
  const checkForUpdate = () => {
    if (!isDocumentVisible()) return;

    const checkedAt = now();
    if (checkedAt - lastUpdateCheckAt < SERVICE_WORKER_UPDATE_INTERVAL_MS) return;

    lastUpdateCheckAt = checkedAt;
    void registration.update().catch(onUpdateError);
  };

  windowTarget.addEventListener("focus", checkForUpdate);
  documentTarget.addEventListener("visibilitychange", checkForUpdate);

  return {
    dispose: () => {
      windowTarget.removeEventListener("focus", checkForUpdate);
      documentTarget.removeEventListener("visibilitychange", checkForUpdate);
    },
  };
}
