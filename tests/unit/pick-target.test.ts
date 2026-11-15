import { describe, expect, it } from 'vitest'
import { pickTarget, type TabLike } from '@/lib/pick-target'

const newTab: TabLike = { id: 100, windowId: 1, incognito: false }

function tab(id: number, extra: Partial<TabLike> = {}): TabLike {
  return { id, windowId: 1, incognito: false, pinned: false, ...extra }
}

describe('pickTarget', () => {
  it('returns undefined without candidates', () => {
    expect(pickTarget([], newTab)).toBeUndefined()
  })

  it('never picks the new tab itself', () => {
    expect(pickTarget([tab(100)], newTab)).toBeUndefined()
    expect(pickTarget([tab(100), tab(1)], newTab)?.id).toBe(1)
  })

  it('skips tabs without an id', () => {
    expect(pickTarget([{ windowId: 1, incognito: false }], newTab)).toBe(
      undefined,
    )
  })

  it('does not merge across incognito and normal windows', () => {
    expect(pickTarget([tab(1, { incognito: true })], newTab)).toBeUndefined()
    const incognitoNew = { ...newTab, incognito: true }
    expect(pickTarget([tab(1)], incognitoNew)).toBeUndefined()
    expect(
      pickTarget([tab(1), tab(2, { incognito: true })], incognitoNew)?.id,
    ).toBe(2)
  })

  it('does not merge across Firefox containers', () => {
    const containerNew = { ...newTab, cookieStoreId: 'firefox-container-1' }
    expect(
      pickTarget(
        [
          tab(1, { cookieStoreId: 'firefox-default' }),
          tab(2, { cookieStoreId: 'firefox-container-1' }),
        ],
        containerNew,
      )?.id,
    ).toBe(2)
  })

  it('prefers the window of the new tab', () => {
    const picked = pickTarget(
      [
        tab(1, { windowId: 2, pinned: true, lastAccessed: 999 }),
        tab(2, { windowId: 1, lastAccessed: 1 }),
      ],
      newTab,
    )
    expect(picked?.id).toBe(2)
  })

  it('falls back to another window', () => {
    expect(pickTarget([tab(1, { windowId: 2 })], newTab)?.id).toBe(1)
  })

  it('prefers pinned tabs within the same window', () => {
    const picked = pickTarget(
      [tab(1, { lastAccessed: 999 }), tab(2, { pinned: true, lastAccessed: 1 })],
      newTab,
    )
    expect(picked?.id).toBe(2)
  })

  it('prefers the most recently accessed tab last', () => {
    const picked = pickTarget(
      [
        tab(1, { lastAccessed: 10 }),
        tab(2, { lastAccessed: 30 }),
        tab(3, { lastAccessed: 20 }),
      ],
      newTab,
    )
    expect(picked?.id).toBe(2)
  })

  it('treats a missing lastAccessed as oldest', () => {
    expect(pickTarget([tab(1), tab(2, { lastAccessed: 5 })], newTab)?.id).toBe(
      2,
    )
  })

  it('does not reorder the input', () => {
    const candidates = [tab(1, { lastAccessed: 1 }), tab(2, { lastAccessed: 2 })]
    pickTarget(candidates, newTab)
    expect(candidates.map((t) => t.id)).toEqual([1, 2])
  })
})
