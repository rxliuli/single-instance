/**
 * Tells a link clicked inside the browser from a link opened by another
 * application. Pure.
 *
 * `openerTabId` alone cannot: Chrome also sets it, to whichever tab is
 * active, on tabs it opens for other applications. Without the
 * `webNavigation` permission there is no direct signal, so this goes by
 * where the tab was placed and what the browser window was doing.
 */

export interface TabPosition {
  id?: number
  windowId?: number
  index: number
  active?: boolean
  openerTabId?: number
}

/** Whether a browser window had focus, and since when. */
export interface FocusState {
  focused: boolean
  at: number
}

/**
 * How long after the browser comes to the front a new tab is still
 * attributed to whatever brought it there.
 */
export const FOCUS_GRACE = 1_000

/**
 * @param windowTabs every tab in the new tab's window
 * @param focus the last known focus change, if any was seen
 */
export function isLinkClick(
  newTab: TabPosition,
  opener: TabPosition,
  windowTabs: TabPosition[],
  focus: FocusState | undefined,
  now: number,
): boolean {
  // Shift+click opens a new window; other applications never do.
  if (newTab.windowId !== opener.windowId) return true

  // A clicked link opens right after its opener, or after the tabs the
  // opener has already opened. A link from outside goes to the end of the
  // tab strip, so anything unrelated in between gives it away.
  const between = windowTabs.filter(
    (t) => t.index > opener.index && t.index < newTab.index,
  )
  if (between.some((t) => t.openerTabId !== opener.id)) return false

  // From here on both kinds of tab would sit in the same place, which only
  // happens when the opener's group is at the end of the tab strip.
  const isLast = windowTabs.every((t) => t.index <= newTab.index)
  if (!isLast) return true
  // Ctrl/Cmd+click and middle click open in the background.
  if (!newTab.active) return true
  // Clicking a link in another application means the browser was not in
  // front, and is brought to the front as the tab opens.
  if (focus && (!focus.focused || now - focus.at < FOCUS_GRACE)) return false
  return true
}
