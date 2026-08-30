import type { Viability } from "@/lib/viability";

/**
 * Client-side persistence for the calendar's multi-dimension filter selection,
 * exposed as a `useSyncExternalStore` source so the calendar can read it without
 * an SSR/hydration mismatch and without a set-state-in-effect. The selection is
 * stored as the **complement** (the excluded ids per dimension) rather than the
 * included ids, so campaigns/masters added since the last visit default to
 * visible and removed ones simply drop out. Storage is best-effort: absent,
 * unreadable or unwritable storage degrades to the "everything visible" (no
 * filter) default without throwing.
 */

const STORAGE_KEY = "dmuster.calendarFilters.v1";

/** The three viability tiers, the fixed universe of the availability filter. */
export const ALL_VIABILITIES: readonly Viability[] = ["S", "T", "N"];

/** The active (shown) selection for each filter dimension. */
export type CalendarFilterSelection = {
  campaignIds: Set<string>;
  masterIds: Set<string>;
  viabilities: Set<Viability>;
};

/** The persisted shape: the excluded (hidden) ids per dimension. */
type StoredExclusions = {
  campaigns: string[];
  masters: string[];
  viabilities: string[];
};

// Same-tab subscribers. The `storage` event only fires in OTHER tabs, so writes
// from this tab must notify these listeners directly.
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Subscribes to persisted-filter changes, both from this tab (writes) and other
 * tabs (the `storage` event). For `useSyncExternalStore`.
 *
 * @param {() => void} callback - Invoked whenever the persisted value changes.
 * @returns {() => void} The unsubscribe function.
 */
export function subscribeCalendarFilters(callback: () => void): () => void {
  listeners.add(callback);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", callback);
  }
  return () => {
    listeners.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", callback);
    }
  };
}

/**
 * The raw persisted string (the client snapshot for `useSyncExternalStore`).
 * Stable by value between reads, so React can detect real changes. Tolerates
 * unavailable storage by returning `null`.
 *
 * @returns {string | null} The stored JSON, or `null` if none/unavailable.
 */
export function getStoredFiltersSnapshot(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * The server/first-hydration snapshot: always "no persisted filter", so the
 * initial client render matches the SSR HTML before hydration re-reads storage.
 *
 * @returns {null} Always `null`.
 */
export function getServerFiltersSnapshot(): null {
  return null;
}

/**
 * Parses a raw snapshot into the excluded ids per dimension, tolerating corrupt
 * JSON and missing fields.
 *
 * @param {string | null} raw - The stored JSON, or `null`.
 * @returns {StoredExclusions} The excluded ids per dimension (empty when absent).
 */
function parseExclusions(raw: string | null): StoredExclusions {
  const empty: StoredExclusions = { campaigns: [], masters: [], viabilities: [] };
  if (!raw) {
    return empty;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredExclusions>;
    return {
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
      masters: Array.isArray(parsed.masters) ? parsed.masters : [],
      viabilities: Array.isArray(parsed.viabilities) ? parsed.viabilities : [],
    };
  } catch {
    return empty;
  }
}

/**
 * Derives the active selection from a raw snapshot, reconciled against the
 * current option universes: any option not explicitly excluded is active.
 *
 * @param {string | null} raw - The stored snapshot.
 * @param {string[]} allCampaignIds - Every selectable campaign id.
 * @param {string[]} allMasterIds - Every selectable master userId.
 * @returns {CalendarFilterSelection} The active selection per dimension.
 */
export function parseStoredSelection(
  raw: string | null,
  allCampaignIds: string[],
  allMasterIds: string[],
): CalendarFilterSelection {
  const excluded = parseExclusions(raw);
  const excludedCampaigns = new Set(excluded.campaigns);
  const excludedMasters = new Set(excluded.masters);
  const excludedViabilities = new Set(excluded.viabilities);
  return {
    campaignIds: new Set(
      allCampaignIds.filter((id) => !excludedCampaigns.has(id)),
    ),
    masterIds: new Set(allMasterIds.filter((id) => !excludedMasters.has(id))),
    viabilities: new Set(
      ALL_VIABILITIES.filter((tier) => !excludedViabilities.has(tier)),
    ),
  };
}

/**
 * Persists a selection as the excluded ids per dimension and notifies this
 * tab's subscribers. No-ops when storage is unavailable.
 *
 * @param {CalendarFilterSelection} selection - The active selection to store.
 * @param {string[]} allCampaignIds - Every selectable campaign id.
 * @param {string[]} allMasterIds - Every selectable master userId.
 */
export function writeStoredSelection(
  selection: CalendarFilterSelection,
  allCampaignIds: string[],
  allMasterIds: string[],
): void {
  if (typeof window === "undefined") {
    return;
  }
  const exclusions: StoredExclusions = {
    campaigns: allCampaignIds.filter((id) => !selection.campaignIds.has(id)),
    masters: allMasterIds.filter((id) => !selection.masterIds.has(id)),
    viabilities: ALL_VIABILITIES.filter(
      (tier) => !selection.viabilities.has(tier),
    ),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(exclusions));
  } catch {
    // Best-effort: ignore quota/availability errors.
  }
  notify();
}

/**
 * Removes the stored filters entirely.
 *
 * What is kept here is a list of the *excluded* campaign ids and master user
 * ids — which is to say, identifiers belonging to whoever was signed in. On a
 * browser more than one person uses, leaving that behind hands the next person
 * a set of ids from someone else's campaigns, and gives them a calendar
 * silently filtered by choices they never made.
 *
 * Distinct from clearing the filters in the UI: that writes an empty exclusion
 * list, which is still a stored preference. This forgets there was one.
 */
export function forgetStoredSelection(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort: ignore availability errors.
  }
  notify();
}
