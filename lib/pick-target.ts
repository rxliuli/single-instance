/** Chooses which existing tab a new tab should be merged into. Pure. */

export interface TabLike {
  id?: number
  windowId?: number
  incognito?: boolean
  pinned?: boolean
  lastAccessed?: number
  /** Firefox container; tabs in different containers have separate sessions. */
  cookieStoreId?: string
}

/**
 * Priority:
 * 1. Same incognito state (and container), and not the new tab itself.
 * 2. Same window as the new tab.
 * 3. Pinned.
 * 4. Most recently accessed.
 */
export function pickTarget<T extends TabLike>(
  candidates: T[],
  newTab: TabLike,
): T | undefined {
  const eligible = candidates.filter(
    (t) =>
      t.id !== undefined &&
      t.id !== newTab.id &&
      !!t.incognito === !!newTab.incognito &&
      (t.cookieStoreId === undefined ||
        newTab.cookieStoreId === undefined ||
        t.cookieStoreId === newTab.cookieStoreId),
  )
  const score = (t: T) =>
    [
      t.windowId === newTab.windowId ? 1 : 0,
      t.pinned ? 1 : 0,
      t.lastAccessed ?? 0,
    ] as const
  return eligible.sort((a, b) => {
    const sa = score(a)
    const sb = score(b)
    return sb[0] - sa[0] || sb[1] - sa[1] || sb[2] - sa[2]
  })[0]
}
