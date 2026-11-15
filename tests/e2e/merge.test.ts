import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { launch, type Harness } from './harness'

let h: Harness

beforeEach(async () => {
  h = await launch()
})

afterEach(async () => {
  await h.close()
})

const urls = async () => (await h.tabs()).map((t) => t.url).sort()

/**
 * Asserts the tabs settle on `expected` and stay there. The extra wait is
 * what catches a merge that should not have happened.
 */
async function expectTabs(expected: string[]) {
  const sorted = [...expected].sort()
  await expect.poll(urls, { timeout: 10_000 }).toEqual(sorted)
  await new Promise((resolve) => setTimeout(resolve, 500))
  expect(await urls()).toEqual(sorted)
}

/** Opens a tab that is already "the instance" of its site. */
async function openExisting(url: string) {
  const page = await h.context.newPage()
  await page.goto(url)
  return page
}

describe('merging', () => {
  it('opens an external link in the existing tab and closes the new one', async () => {
    await h.setRules([{ pattern: 'http://a.test/*' }])
    await openExisting(h.site('a', '/one'))

    await h.openExternal(h.site('a', '/two'))

    await expectTabs([h.site('a', '/two')])
    expect((await h.tabs())[0]?.active).toBe(true)
  })

  it('merges a link clicked on another site', async () => {
    await h.setRules([{ pattern: 'http://a.test/*' }])
    await openExisting(h.site('a', '/one'))
    const other = await openExisting(h.site('b'))

    await other.click('#to-a')

    await expectTabs([h.site('a', '/from-link'), h.site('b')])
  })

  it('merges an external link even when the site tab is its opener', async () => {
    await h.setRules([{ pattern: 'http://a.test/*' }])
    await openExisting(h.site('a', '/one'))
    const [existing] = await h.tabs()
    await openExisting(h.site('b'))

    // Chrome names the active tab as opener of links from other
    // applications, and puts them at the end of the tab strip.
    await h.openExternal(h.site('a', '/two'), { openerTabId: existing!.id })

    await expectTabs([h.site('a', '/two'), h.site('b')])
  })

  it('merges into a tab in another window and focuses it', async () => {
    await h.setRules([{ pattern: 'http://a.test/*' }])
    await openExisting(h.site('a', '/one'))
    const [existing] = await h.tabs()
    const secondWindow = await h.newWindow(h.site('b'))
    await expectTabs([h.site('a', '/one'), h.site('b')])

    await h.openExternal(h.site('a', '/two'), { windowId: secondWindow })

    await expectTabs([h.site('a', '/two'), h.site('b')])
    const merged = (await h.tabs()).find((t) => t.url === h.site('a', '/two'))
    expect(merged?.id).toBe(existing?.id)
    expect(merged?.windowId).toBe(existing?.windowId)
  })

  it('merges several links opened at once into one tab', async () => {
    await h.setRules([{ pattern: 'http://a.test/*' }])
    await openExisting(h.site('a', '/one'))

    await Promise.all([
      h.openExternal(h.site('a', '/two')),
      h.openExternal(h.site('a', '/three')),
      h.openExternal(h.site('a', '/four')),
    ])

    await expect.poll(async () => (await h.tabs()).length).toBe(1)
  })

  it('still merges after the service worker has been stopped', async () => {
    await h.setRules([{ pattern: 'http://a.test/*' }])
    await openExisting(h.site('a', '/one'))
    // A blank tab opened by the browser gets the active tab as its opener,
    // so make sure that is not the site's own tab.
    await openExisting(h.site('b'))
    await h.stopServiceWorker()

    // Not through the worker this time: the new tab has to wake it up.
    const page = await h.context.newPage()
    await page.goto(h.site('a', '/two')).catch(() => {})

    await expectTabs([h.site('a', '/two'), h.site('b')])
  })
})

describe('leaving tabs alone', () => {
  it('keeps the new tab when the site has no tab yet', async () => {
    await h.setRules([{ pattern: 'http://a.test/*' }])
    await openExisting(h.site('b'))

    await h.openExternal(h.site('a', '/one'))

    await expectTabs([h.site('a', '/one'), h.site('b')])
  })

  it('keeps a tab opened from a tab of the same site', async () => {
    await h.setRules([{ pattern: 'http://a.test/*' }])
    const page = await openExisting(h.site('a', '/one'))

    await page.click('#same')

    await expectTabs([h.site('a', '/one'), h.site('a', '/from-link')])
  })

  it('keeps a popup window opened by a page', async () => {
    await h.setRules([{ pattern: 'http://a.test/*' }])
    await openExisting(h.site('a', '/one'))
    const other = await openExisting(h.site('b'))

    await other.evaluate((url) => {
      window.open(url, '_blank', 'popup,width=400,height=400')
    }, h.site('a', '/oauth'))

    await expectTabs([h.site('a', '/one'), h.site('a', '/oauth'), h.site('b')])
  })

  it('keeps a blank tab opened from the site and then navigated', async () => {
    await h.setRules([{ pattern: 'http://a.test/*' }])
    await openExisting(h.site('a', '/one'))

    // The site's tab is active, so it becomes the blank tab's opener.
    const page = await h.context.newPage()
    await page.goto(h.site('a', '/two'))

    await expectTabs([h.site('a', '/one'), h.site('a', '/two')])
  })

  it('does nothing for a disabled rule', async () => {
    await h.setRules([{ pattern: 'http://a.test/*', enabled: false }])
    await openExisting(h.site('a', '/one'))

    await h.openExternal(h.site('a', '/two'))

    await expectTabs([h.site('a', '/one'), h.site('a', '/two')])
  })

  it('does nothing for sites without a rule', async () => {
    await h.setRules([{ pattern: 'http://a.test/*' }])
    await openExisting(h.site('b', '/one'))

    await h.openExternal(h.site('b', '/two'))

    await expectTabs([h.site('b', '/one'), h.site('b', '/two')])
  })

  it('does not touch navigation inside an existing tab', async () => {
    await h.setRules([{ pattern: 'http://a.test/*' }])
    await openExisting(h.site('a', '/one'))
    const page = await openExisting(h.site('b'))
    // Past the window in which a tab counts as new.
    await new Promise((resolve) => setTimeout(resolve, 10_500))

    await page.goto(h.site('a', '/two'))

    await expectTabs([h.site('a', '/one'), h.site('a', '/two')])
  })
})
