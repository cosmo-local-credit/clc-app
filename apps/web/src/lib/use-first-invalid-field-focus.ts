import { useCallback, useEffect, useRef } from "react";

const INVALID_SELECTOR = '[aria-invalid="true"]';

function isFocusableInvalidControl(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
  if (element.matches(':disabled, [aria-disabled="true"], [tabindex="-1"]')) return false;

  return element.matches('button, input:not([type="hidden"]), select, textarea, [tabindex]');
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Focuses and centers the first invalid, interactive control in document order. */
export function focusFirstInvalidControl(form: HTMLFormElement): boolean {
  const control = Array.from(form.querySelectorAll(INVALID_SELECTOR)).find(
    isFocusableInvalidControl,
  );
  if (!control) return false;

  control.focus({ preventScroll: true });
  control.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "center",
    inline: "nearest",
  });
  return true;
}

/**
 * Schedules invalid-field focus for after React has rendered validation state.
 * Repeated submissions share one pending frame, and unmounting cancels it.
 */
export function useFirstInvalidFieldFocus() {
  const formRef = useRef<HTMLFormElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  const focusFirstInvalidField = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      if (formRef.current) focusFirstInvalidControl(formRef.current);
    });
  }, []);

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    },
    [],
  );

  return { formRef, focusFirstInvalidField };
}
