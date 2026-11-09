import { onTestFinished } from "vite-plus/test";

type Registration = { callback: IntersectionObserverCallback; targets: Set<Element> };

/**
 * Installs an IntersectionObserver that reports an element on screen only
 * when the test calls `reveal`, and removes it when the test finishes. jsdom
 * has none, so without this a component sees every observed element at once.
 */
export function stubIntersectionObserver() {
  const registrations = new Set<Registration>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "IntersectionObserver");

  class FakeIntersectionObserver {
    readonly root = null;
    readonly rootMargin = "0px";
    readonly thresholds = [0];
    private readonly registration: Registration;
    constructor(callback: IntersectionObserverCallback) {
      this.registration = { callback, targets: new Set() };
      registrations.add(this.registration);
    }
    observe(target: Element) {
      this.registration.targets.add(target);
    }
    unobserve(target: Element) {
      this.registration.targets.delete(target);
    }
    disconnect() {
      registrations.delete(this.registration);
    }
    takeRecords() {
      return [];
    }
  }

  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    writable: true,
    value: FakeIntersectionObserver,
  });
  onTestFinished(() => {
    if (original) Object.defineProperty(globalThis, "IntersectionObserver", original);
    else Reflect.deleteProperty(globalThis, "IntersectionObserver");
  });

  return {
    /** Reports every observed element that contains `element` as on screen. */
    reveal(element: Element) {
      for (const { callback, targets } of registrations) {
        for (const target of targets) {
          if (!target.contains(element)) continue;
          callback(
            [{ target, isIntersecting: true } as unknown as IntersectionObserverEntry],
            {} as unknown as IntersectionObserver,
          );
        }
      }
    },
  };
}
