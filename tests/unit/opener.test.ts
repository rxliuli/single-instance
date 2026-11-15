import { describe, expect, it } from 'vitest'
import { FOCUS_GRACE, isLinkClick, type TabPosition } from '@/lib/opener'

const NOW = 1_000_000
const longFocused = { focused: true, at: NOW - 60_000 }

function tab(id: number, index: number, extra: Partial<TabPosition> = {}) {
  return { id, windowId: 1, index, active: false, ...extra }
}

describe('isLinkClick', () => {
  it('is a link click when the tab opens right after its opener', () => {
    const opener = tab(1, 0)
    const newTab = tab(2, 1, { openerTabId: 1, active: true })
    const tabs = [opener, newTab, tab(3, 2)]
    expect(isLinkClick(newTab, opener, tabs, longFocused, NOW)).toBe(true)
  })

  it('is a link click when it follows other tabs of the same opener', () => {
    const opener = tab(1, 0)
    const sibling = tab(2, 1, { openerTabId: 1 })
    const newTab = tab(3, 2, { openerTabId: 1, active: true })
    const tabs = [opener, sibling, newTab, tab(4, 3)]
    expect(isLinkClick(newTab, opener, tabs, longFocused, NOW)).toBe(true)
  })

  it('is external when unrelated tabs sit between it and the opener', () => {
    const opener = tab(1, 0)
    const newTab = tab(3, 2, { openerTabId: 1, active: true })
    const tabs = [opener, tab(2, 1), newTab]
    expect(isLinkClick(newTab, opener, tabs, longFocused, NOW)).toBe(false)
    expect(isLinkClick(newTab, opener, tabs, undefined, NOW)).toBe(false)
  })

  it('is a link click when it opens in another window', () => {
    const opener = tab(1, 0)
    const newTab = tab(2, 0, { windowId: 2, openerTabId: 1, active: true })
    expect(isLinkClick(newTab, opener, [newTab], undefined, NOW)).toBe(true)
  })

  describe('when the opener is the last tab', () => {
    const opener = tab(1, 1)
    const tabs = (newTab: TabPosition) => [tab(0, 0), opener, newTab]

    it('is a link click for a background tab', () => {
      const newTab = tab(2, 2, { openerTabId: 1, active: false })
      const justFocused = { focused: true, at: NOW - 10 }
      expect(isLinkClick(newTab, opener, tabs(newTab), justFocused, NOW)).toBe(
        true,
      )
    })

    const newTab = tab(2, 2, { openerTabId: 1, active: true })

    it('is a link click when the browser has been in front for a while', () => {
      expect(isLinkClick(newTab, opener, tabs(newTab), longFocused, NOW)).toBe(
        true,
      )
      const atGrace = { focused: true, at: NOW - FOCUS_GRACE }
      expect(isLinkClick(newTab, opener, tabs(newTab), atGrace, NOW)).toBe(true)
    })

    it('is external when the browser just came to the front', () => {
      const justFocused = { focused: true, at: NOW - 67 }
      expect(isLinkClick(newTab, opener, tabs(newTab), justFocused, NOW)).toBe(
        false,
      )
    })

    it('is external when the browser is not in front', () => {
      const unfocused = { focused: false, at: NOW - 60_000 }
      expect(isLinkClick(newTab, opener, tabs(newTab), unfocused, NOW)).toBe(
        false,
      )
    })

    it('is a link click when no focus change has been seen', () => {
      expect(isLinkClick(newTab, opener, tabs(newTab), undefined, NOW)).toBe(
        true,
      )
    })
  })
})
