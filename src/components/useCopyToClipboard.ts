"use client";

import { type RefObject, useCallback, useRef, useState } from "react";

/** Where a copy attempt stands: not tried, done, or left for the user to finish by hand. */
export type CopyState = "idle" | "copied" | "manual";

/** What `useCopyToClipboard` hands back. */
export type UseCopyToClipboard = {
  copyState: CopyState;
  /** Attach to the read-only input showing the text, so it can be selected as a fallback. */
  inputRef: RefObject<HTMLInputElement | null>;
  /** Copies `text`; falls back to selecting the input when the Clipboard API is unavailable. */
  copy: (text: string) => Promise<void>;
  /** Returns to `idle`, e.g. when the text being shown changes. */
  reset: () => void;
};

/**
 * Copies text via the Clipboard API when available; otherwise selects the
 * (read-only) input holding it so the user can copy it manually —
 * `navigator.clipboard` is undefined over plain HTTP on a non-localhost
 * address, which a LAN deployment can easily hit.
 *
 * @returns {UseCopyToClipboard} The copy state, an input ref, `copy` and `reset`.
 */
export function useCopyToClipboard(): UseCopyToClipboard {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const copy = useCallback(async (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        setCopyState("copied");
        return;
      } catch {
        // Fall through to the manual selection below.
      }
    }
    inputRef.current?.select();
    setCopyState("manual");
  }, []);

  const reset = useCallback(() => setCopyState("idle"), []);

  return { copyState, inputRef, copy, reset };
}
