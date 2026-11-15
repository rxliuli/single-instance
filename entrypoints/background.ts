import type { Browser } from 'wxt/browser'
import { matches } from '@/lib/match'
import { isLinkClick, type FocusState } from '@/lib/opener'
import { pickTarget } from '@/lib/pick-target'
import { getRules, matchRule, type Rule } from '@/lib/rules'

type Tab = Browser.tabs.Tab

/** How long after creation a tab still counts as "new". */
const FRESH_TTL = 10_000
const BADGE_MS = 2_000
const SESSION_KEY = 'session'

/**
 * Runtime state. Lives in `storage.session` because the service worker can be
 * stopped at any time; anything kept only in memory would be lost.
 */
interface Session {
  /** tabId -> creation time. Only new tabs are ever intercepted. */
  freshTabs: Record<number, number>
  /**
   * Tabs the extension has navigated or focused as a merge target. They are
   * the site's instance now, so their later navigations are left alone.
   */
  selfNavigated: number[]
  /** The last focus change of the browser's windows, if one was seen. */
  focus?: FocusState
}

async function loadSession(): Promise<Session> {
  const data = await browser.storage.session.get(SESSION_KEY)
  const raw = data[SESSION_KEY] as Partial<Session> | undefined
  const session: Session = {
    freshTabs: raw?.freshTabs ?? {},
    selfNavigated: raw?.selfNavigated ?? [],
    focus: raw?.focus,
  }
  const now = Date.now()
  for (const [id, createdAt] of Object.entries(session.freshTabs)) {
    if (now - createdAt > FRESH_TTL) delete session.freshTabs[Number(id)]
  }
  return session
}

async function saveSession(session: Session): Promise<void> {
  await browser.storage.session.set({ [SESSION_KEY]: session })
}

/**
 * Runs handlers one at a time. `onCreated` and `onUpdated` fire almost
 * together for the same tab, and several tabs can open at once; without this
 * their read-modify-write cycles on the session would interleave and one tab
 * could be merged twice. If the worker dies mid-task the queue dies with it
 * and the worst outcome is that a new tab is kept.
 */
let queue: Promise<unknown> = Promise.resolve()
function serial(task: () => Promise<void>): void {
  queue = queue.then(task).catch((err) => {
    console.error('[single-instance]', err)
  })
}

/**
 * Tabs whose `onCreated` handler is still waiting in the queue. They are not
 * in `freshTabs` yet, but must already be treated as new.
 */
const justCreated = new Set<number>()

function isWebUrl(url: string | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url)
}

/**
 * A tab opened by a link in a tab of the same site (Ctrl/Cmd+click, middle
 * click) or as a popup window (OAuth and similar) is something the site or
 * the user asked for on purpose, so it is left alone.
 */
async function isExempt(
  newTab: Tab,
  rule: Rule,
  focus: FocusState | undefined,
): Promise<boolean> {
  if (newTab.openerTabId === undefined) return false
  try {
    const opener = await browser.tabs.get(newTab.openerTabId)
    if (opener.url && matches(rule.pattern, opener.url)) {
      // Having the site's tab as opener is not enough: the browser also
      // sets it on links opened by other applications.
      const windowTabs = await browser.tabs.query({ windowId: newTab.windowId })
      if (isLinkClick(newTab, opener, windowTabs, focus, Date.now())) {
        return true
      }
    }
  } catch {
    // The opener is already gone.
  }
  try {
    const win = await browser.windows.get(newTab.windowId)
    if (win.type === 'popup') return true
  } catch {
    // No windows API (Firefox for Android) or the window is gone.
  }
  return false
}

function flashBadge(tabId: number): void {
  const set = (text: string) =>
    browser.action.setBadgeText({ text, tabId }).catch(() => {})
  void set('↩')
  browser.action.setBadgeBackgroundColor({ color: '#4f46e5' }).catch(() => {})
  setTimeout(() => void set(''), BADGE_MS)
}

async function tryMerge(
  newTab: Tab,
  url: string,
  session: Session,
): Promise<void> {
  const newTabId = newTab.id
  if (newTabId === undefined) return
  const rule = matchRule(await getRules(), url)
  if (!rule) return

  /** The new tab stays and becomes an ordinary tab of the site. */
  const keep = async () => {
    delete session.freshTabs[newTabId]
    await saveSession(session)
  }

  if (await isExempt(newTab, rule, session.focus)) return keep()

  // Tabs the extension has no access to come back without a URL, which
  // excludes them here. Other new tabs are excluded too: they are waiting
  // for their own turn, and merging into one could send an existing tab
  // into the tab that is about to be merged into it.
  const candidates = (await browser.tabs.query({})).filter((t) => {
    if (t.id === undefined || t.id === newTabId) return false
    if (t.id in session.freshTabs || justCreated.has(t.id)) return false
    const tabUrl = t.url || t.pendingUrl
    return !!tabUrl && matches(rule.pattern, tabUrl)
  })
  const target = pickTarget(candidates, newTab)
  if (target?.id === undefined) return keep()

  delete session.freshTabs[target.id]
  if (!session.selfNavigated.includes(target.id)) {
    session.selfNavigated.push(target.id)
  }
  await saveSession(session)

  // Update the target before closing the new tab: if the target has just
  // been closed, the new tab survives and the link is not lost.
  try {
    await browser.tabs.update(target.id, { url, active: true })
  } catch {
    return keep()
  }
  try {
    await browser.windows.update(target.windowId, { focused: true })
  } catch {
    // No windows API (Firefox for Android).
  }
  try {
    await browser.tabs.remove(newTabId)
  } catch {
    // Already closed.
  }
  delete session.freshTabs[newTabId]
  await saveSession(session)
  flashBadge(target.id)
}

export default defineBackground(() => {
  // Listeners are registered synchronously at the top level so the browser
  // can wake the service worker for them.

  browser.tabs.onCreated.addListener((tab) => {
    if (tab.id !== undefined) justCreated.add(tab.id)
    serial(async () => {
      if (tab.id === undefined) return
      const session = await loadSession()
      justCreated.delete(tab.id)
      if (session.selfNavigated.includes(tab.id)) return
      session.freshTabs[tab.id] = Date.now()
      await saveSession(session)
      const url = tab.pendingUrl || tab.url
      if (isWebUrl(url)) await tryMerge(tab, url, session)
    })
  })

  browser.tabs.onUpdated.addListener((tabId, change, tab) => {
    // `pendingUrl` lets a new tab be closed before the page starts loading;
    // `change.url` is the fallback once the navigation has committed.
    const url =
      change.url ?? (change.status === 'loading' ? tab.pendingUrl : undefined)
    if (!isWebUrl(url)) return
    serial(async () => {
      const session = await loadSession()
      if (session.selfNavigated.includes(tabId)) return
      if (!(tabId in session.freshTabs)) return
      await tryMerge(tab, url, session)
    })
  })

  // Firefox for Android has no windows API.
  browser.windows?.onFocusChanged.addListener((windowId) => {
    const at = Date.now()
    serial(async () => {
      const session = await loadSession()
      session.focus = { focused: windowId !== browser.windows.WINDOW_ID_NONE, at }
      await saveSession(session)
    })
  })

  browser.tabs.onRemoved.addListener((tabId) => {
    serial(async () => {
      const session = await loadSession()
      const tracked =
        tabId in session.freshTabs || session.selfNavigated.includes(tabId)
      if (!tracked) return
      delete session.freshTabs[tabId]
      session.selfNavigated = session.selfNavigated.filter((id) => id !== tabId)
      await saveSession(session)
    })
  })
})
