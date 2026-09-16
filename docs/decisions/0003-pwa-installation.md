# ADR 0003: Public PWA installation flow

- Status: Accepted
- Date: 2026-09-15
- Updated: 2026-09-16

## Decision

Expose `/install` outside the authenticated navigation shell. Settings links to
it; onboarding opens the installation dialog directly and links to help.
Installation is optional and visitors can continue to the public Market without
creating an account. Installed users see "Share CLC" as the entry point.

### Installation follows the selected CLC language

All app-owned installation UI uses Lingui and the existing CLC locale provider:
the CTA, dialog title, native-prompt button, numbered browser instructions,
status/error messages, and share page. The dialog includes the language selector;
switching between English, Serbian, and Swahili updates an open dialog without
losing a retained browser event. Platform instructions are shared between the
dialog and `/install` so the two surfaces cannot drift.

The previous implementation used `@khmyznikov/pwa-install` 0.7.0. Its dialog
selected `navigator.language`, exposed no public locale setter, and lacked a
Swahili catalog. Translations on the surrounding page did not fix the dialog.
The user requires the actual installation steps to follow their language choice,
so CLC now owns the small React dialog using its existing Base UI primitives.
The package and its unused dependencies have been removed rather than patching
vendor internals or changing browser globals.

The browser/OS confirmation and browser menu labels follow the device/browser
language. CLC cannot override those. Instructions provide translated actions
and, where helpful, the recognizable browser labels.

### Capture early; load the dialog at its entry point

A small inline root-document script captures `beforeinstallprompt` before
hydration and retains it in memory across route changes. React subscribes
through Zustand. Capture calls `preventDefault()` to defer automatic promotion;
the event and installed status are never persisted.

The install CTA preloads CLC's own dialog through a dynamic import. It mounts
only after a tap, inside the existing React/Lingui tree. The root never imports
the dialog runtime. Serwist excludes `install-app-dialog-*.js` from precaching
so background registration preserves this deferred download boundary. Settings
retains a lightweight link. A failed lazy import leaves the help page available.

When a browser event is available, the dialog's "Install now" button calls
`prompt()` directly from the user gesture and clears the retained event before
awaiting. Repeated taps cannot reuse it. Closing the custom dialog preserves an
unused event. Native cancellation/failure requires a fresh event for another
native attempt and leaves translated manual instructions available. Late results
from an earlier attempt cannot overwrite a newer event or confirmed installation.

Acceptance means installation was requested, not completed. Only `appinstalled`,
standalone display mode, or iOS's `navigator.standalone` marks the app installed.
An ordinary browser tab cannot always detect a previous installation; missing
`beforeinstallprompt` alone proves neither installation nor incompatibility.

Without a native event, show numbered instructions for iPhone/iPad or Android,
and browser-menu/Safari Dock help elsewhere. User-agent detection only selects
help text; it does not decide whether a native prompt is available. Known
embedded browsers also get instructions to open a full browser first.

### Sharing

Share the current origin's `/install` URL, excluding search parameters and
fragments. This keeps previews local and avoids sharing wallet import data.
Use the native share sheet, then clipboard, then a selectable link. Cancelling
the share sheet does not copy anything.

## Verification

Regression tests use the real Lingui/provider and real dialog language selector,
including switching languages while the dialog is open, a retained native event
through a locale change, and translated cancellation. Browser-event and route
coverage includes early capture, repeated taps, fresh events, cleanup, sharing,
and Back navigation. A lazy-import failure test covers the help fallback.

Verification on 2026-09-16: 32 focused tests passed across six files;
`vp check` and the production web build passed. Lingui extraction reports no
missing active Serbian or Swahili translations. Built-asset inspection confirms
a separate dynamically imported dialog chunk, excluded from the service worker
precache, and no remaining external-package chunk.

No browser was connected for visual QA in this session.
Actual Android/iPhone OS installation still requires a deployed HTTPS device
check; automated tests simulate the native browser prompt.

Knip cleanup remains deferred; bypassing local commit hooks does not disable CI.

## Reference

- [Apple: Use Safari web apps on Mac](https://support.apple.com/en-ie/104996)
