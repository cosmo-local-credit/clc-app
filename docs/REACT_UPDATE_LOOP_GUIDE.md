# Guide: Finding and fixing React update loops

Use this guide when the UI shows errors such as:

- `Maximum update depth exceeded`
- A screen crashes after repeatedly opening/closing a sheet or dialog
- A component keeps rerendering without user input
- React DevTools or browser performance traces show a render loop

## 1. Reproduce with a tight loop

Create the smallest repeatable action sequence.

Example:

1. Open the affected page.
2. Open the sheet/dialog.
3. Dismiss it by tapping outside or pressing Escape.
4. Repeat 3–5 times.

Then capture the exact error from the browser console or the app error boundary.

## 2. Identify mounted-but-closed components

Sheets, dialogs, and popovers are often still mounted while closed. A bug can live in a closed component and be triggered by unrelated page rerenders.

Check for components like:

```tsx
<SomeSheet open={open} onOpenChange={setOpen} />
```

Even when `open === false`, hooks inside `SomeSheet` still run if the component remains mounted.

## 3. Audit effects that call state setters or mutation reset methods

Search the affected component for effects that call:

- `setState(...)`
- `mutation.reset()`
- `queryClient.invalidateQueries(...)`
- `queryClient.setQueryData(...)`
- `navigate(...)`
- `form.reset(...)`

Problem pattern:

```tsx
const mutation = useMutation(...);

useEffect(() => {
  if (open) return;
  mutation.reset();
  setValue("");
}, [open, mutation]);
```

If `mutation` is a new object identity after reset/rerender, the effect runs again, calls `reset()` again, and loops.

## 4. Do not depend on whole hook result objects

Avoid putting whole objects from hooks in dependency arrays:

- TanStack Query query result object
- TanStack Query mutation result object
- router/navigation objects if unstable
- form field/meta objects
- freshly created arrays/objects/functions

Prefer primitive fields or stable callbacks.

Better:

```tsx
const mutation = useMutation(...);

useEffect(() => {
  if (open) return;
  mutation.reset();
  setValue("");
  // Intentionally keyed only by the lifecycle transition.
}, [open]);
```

For effects that should react to mutation state:

```tsx
useEffect(() => {
  if (!enabled) return;
  if (!query.isSuccess || query.isFetching) return;
  if (mutation.isIdle) {
    mutation.mutate(input);
  }
}, [enabled, query.isSuccess, query.isFetching, mutation.isIdle, input]);
```

## 5. Separate lifecycle cleanup from async orchestration

A common safe pattern:

```tsx
// Cleanup when closed.
useEffect(() => {
  if (open) return;
  resetLocalUiState();
}, [open]);

// Async action when open and data is ready.
useEffect(() => {
  if (!open || !ready || alreadyDone) return;
  runMutation();
}, [open, ready, alreadyDone, runMutationState]);
```

Do not mix close cleanup and async mutation orchestration in one broad effect.

## 6. Add a regression test

Lock the specific interaction down.

Example:

```tsx
it("can repeatedly open and dismiss the sheet", async () => {
  renderPage();

  const trigger = await screen.findByRole("button", { name: /open sheet/i });

  for (let index = 0; index < 4; index += 1) {
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  }
});
```

The test should fail before the fix or at least exercise the same lifecycle path that crashed in the browser.

## 7. Validate in the browser

After the code fix:

1. Reload the affected page.
2. Repeat the original open/dismiss sequence more times than needed to trigger the bug.
3. Check console messages.
4. Confirm the error boundary does not appear.

## Review checklist

Before merging a fix for this class of bug:

- [ ] No effect depends on a whole query/mutation/form result object unless proven stable.
- [ ] Effects that call setters have the narrowest possible dependency list.
- [ ] Closed sheets/dialogs do not perform repeated cleanup work on unrelated rerenders.
- [ ] Async effects are guarded by explicit state checks such as `open`, `enabled`, `isSuccess`, `isFetching`, `isIdle`.
- [ ] A regression test repeats the user interaction that triggered the loop.
- [ ] Browser smoke test confirms no error boundary or console error.
