"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Moves focus into an overlay while it is open, and puts it back where it came
 * from when the overlay goes away.
 *
 * Every overlay in the app was doing this by hand, and each hand-written copy
 * got a different half of it wrong:
 *
 * - One captured and restored correctly, but hung the effect off the parent's
 *   `onClose` callback. Parents pass an inline arrow, so the callback has a new
 *   identity on every parent render — and the parent re-renders in response to
 *   actions taken *inside* the overlay. The effect tore down and re-ran on each
 *   one, snatching focus off whatever control the person had just used and
 *   re-capturing "where focus came from" as that control.
 * - Another focused on open and simply never restored, because its effect had
 *   no cleanup at all. Closing by Escape or by clicking away dropped focus onto
 *   `<body>`, which for anyone navigating by keyboard means starting over from
 *   the top of the document.
 *
 * The fix in both cases is the same, and it is mostly about the dependency
 * array: this effect depends on *whether the overlay is open* and on nothing
 * else. The target lookup is read through a ref so that passing an inline
 * function does not re-trigger it.
 *
 * Does not trap focus. Neither dialog here is `aria-modal="true"`, and the
 * decision to leave the page behind them reachable is deliberate.
 *
 * @param {boolean} active - Whether the overlay is currently open. An overlay
 *   that mounts and unmounts can leave this at its default.
 * @param {() => HTMLElement | null | undefined} resolveTarget - Returns the
 *   element to receive focus. Called once, when `active` becomes true.
 */
export function useReturnFocus(
  active: boolean,
  resolveTarget: () => HTMLElement | null | undefined,
): void {
  const resolveTargetRef = useRef(resolveTarget);

  // Kept current in an effect rather than during render, and declared before
  // the one below so that on the render where `active` flips it has already
  // run. Callers pass an inline function, so its identity changes constantly;
  // reading it through a ref is what keeps it out of the dependency array
  // below — which is the entire fix.
  useEffect(() => {
    resolveTargetRef.current = resolveTarget;
  });

  useEffect(() => {
    if (!active) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    resolveTargetRef.current()?.focus();

    return () => {
      // Guard against restoring to something no longer in the document: an
      // element removed while the overlay was open cannot take focus, and
      // calling `focus()` on it silently leaves focus on `<body>`.
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [active]);
}

/**
 * Convenience wrapper for the common case: focus the overlay's own container.
 *
 * @param {RefObject<HTMLElement | null>} target - The element to focus.
 * @param {boolean} [active] - Whether the overlay is open; defaults to true for
 *   overlays that mount and unmount instead of toggling.
 */
export function useReturnFocusTo(
  target: RefObject<HTMLElement | null>,
  active = true,
): void {
  useReturnFocus(active, () => target.current);
}
