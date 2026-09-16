# ADR 0003: Public PWA installation flow

- Status: Accepted
- Date: 2026-09-15
- Updated: 2026-09-16

## Decision

Expose `/install` outside the authenticated navigation shell. Settings links to
it; the onboarding welcome CTA opens the install dialog directly and includes
a help link to `/install`. Installation is optional. Visitors can continue to
the public Market without creating an account. Installed users see "Share CLC"
as the entry point.

### Capture early; load the dialog at its entry point

The root document includes a small inline script before hydration. It captures
`beforeinstallprompt` in memory for the lifetime of the document, including
before React mounts and across route changes. React subscribes to this snapshot
through Zustand. The event and installation state are never persisted.

Capture calls `preventDefault()` to defer Chrome's automatic promotion and
`stopImmediatePropagation()` to give the early listener sole ownership of
capture. This supersedes the original staged decision to preserve automatic
Chrome promotion. The dialog receives both retained and newly arriving events
through its `externalPromptEvent` property; it does not need to catch the
original browser dispatch itself.

The onboarding CTA and `/install` preload `@khmyznikov/pwa-install` through a
client-only dynamic import when the CTA mounts. The root never imports its
runtime. The service worker excludes `pwa-install.es-*.js` from precaching so
background registration cannot fetch the dialog ahead of the CTA. Settings
retains a lightweight link. Preloading does not mount or open
a dialog: an explicit tap creates the custom element with `manual-apple` and
`manual-chrome`, waits for its initial Lit update, and calls `showDialog()`.
The native install action remains inside the library's dialog, preserving a
fresh user gesture even when the initial import was slow.

A controller guards repeated taps and removes its element and subscription
on navigation. Initialization has a bounded wait, with a translated help
fallback on failure. The library owns native prompting, while the app tracks
its backend/choice/failure events. Starting a legacy prompt clears the retained
event synchronously. Closing only the custom sheet leaves an unused native
event available. A failed Web Install attempt retains its legacy fallback when
the library says a second user tap can use it.

Acceptance means installation was requested, not completed. Only `appinstalled`,
standalone display mode, or iOS's `navigator.standalone` marks the app installed.
An ordinary browser tab cannot always detect a previous installation; missing
`beforeinstallprompt` alone proves neither installation nor incompatibility.

### Help, language, and sharing

The library supplies platform-specific installation instructions. `/install`
also keeps one short Lingui-translated fallback covering browser menus, iPhone
Share/Add to Home Screen, and embedded browsers. This stays usable if the lazy
chunk fails or the library has no instructions for the browser.

Version 0.7.0 chooses its dialog language from `navigator.language`, exposes no
public locale setter, and has no Swahili translation. We do not alter browser
globals or patch library internals. CLC's CTA, status, help, and share UI follow
the selected app language; the library dialog follows the browser language.
Supporting a fully app-selected dialog locale remains an upstream integration
question.

Share the current origin's `/install` URL, excluding search parameters and
fragments. This keeps previews local and avoids sharing wallet import data.
Use the native share sheet, then clipboard, then a selectable link. Cancelling
the share sheet does not copy anything.

## Verification

The install UI tests exercise early capture, property handoff, late events,
initialization ordering, repeated taps, cancellation, failure, cleanup during
navigation, installed state, sharing, and real route Back behavior. Separate
integration tests exercise the installed library with Lit and mocked browser
install events, including its iPhone instructional dialog.

Real Android/iPhone OS installation still requires a deployed HTTPS device
check. The earlier 360px/430px manual review covered the original custom page;
it is not verification of this library dialog.

Verified on 2026-09-16:

- Focused install, Settings, onboarding, and route-policy tests: 33 passed
  across six files, including lazy-import failure and real-library coverage.
- `vp check`: formatting, lint, and types passed.
- `vp build apps/web`: production build passed.
- Built-asset inspection: the dialog is dynamically imported from the install
  button chunk and absent from `sw.js`'s precache list (about 47 kB gzip).
- Lingui extraction: no missing translations in the active Serbian/Swahili
  catalogs after adding the fallback message.

Knip cleanup is deliberately deferred; bypassing local commit hooks does not
disable CI.

## References

- [pwa-install async mode](https://github.com/khmyznikov/pwa-install#async-mode)
- [pwa-install API and manual dialog control](https://github.com/khmyznikov/pwa-install#parameter-behavior)
- [Custom install experience](https://web.dev/articles/customize-install)
