import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium, type BrowserContext, type Worker } from 'playwright'
import type { browser } from 'wxt/browser'

/** Only exists inside the service worker, where `evaluate` callbacks run. */
declare const chrome: typeof browser

const EXTENSION_DIR = path.resolve(
  import.meta.dirname,
  '../../.output/chrome-mv3-e2e',
)

export interface RuleInput {
  pattern: string
  enabled?: boolean
}

export interface TabInfo {
  id: number
  windowId: number
  url: string
  active: boolean
}

export interface Harness {
  context: BrowserContext
  /** URL on a fake site, e.g. `site('a', '/one')` -> http://a.test:PORT/one */
  site(name: string, pathname?: string): string
  setRules(rules: RuleInput[]): Promise<void>
  /** Every tab on the fake sites. */
  tabs(): Promise<TabInfo[]>
  /** Opens a URL the way another application would: no opener tab. */
  openExternal(
    url: string,
    options?: { windowId?: number; openerTabId?: number },
  ): Promise<void>
  /** Opens a second browser window and returns its id. */
  newWindow(url: string): Promise<number>
  /** Kills the extension's service worker, as the browser does when idle. */
  stopServiceWorker(): Promise<void>
  close(): Promise<void>
}

/**
 * Every `*.test` host resolves to this server, so the fake sites need no
 * network. Each page links to another page of the same site and to site "a".
 */
function startServer(): Promise<Server> {
  const server = createServer((req, res) => {
    const port = (server.address() as AddressInfo).port
    res.setHeader('content-type', 'text/html')
    res.end(`<!doctype html><title>${req.headers.host}${req.url}</title>
<a id="same" href="/from-link" target="_blank">same site</a>
<a id="to-a" href="http://a.test:${port}/from-link" target="_blank">site a</a>`)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

export async function launch(): Promise<Harness> {
  const server = await startServer()
  const port = (server.address() as AddressInfo).port
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'single-instance-'))
  const context = await chromium.launchPersistentContext(userDataDir, {
    // The full Chromium build: the headless shell cannot load extensions.
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
      '--host-resolver-rules=MAP *.test 127.0.0.1',
    ],
  })

  const isOurs = (w: Worker) => w.url().endsWith('/background.js')
  const worker = async (): Promise<Worker> =>
    context.serviceWorkers().find(isOurs) ??
    (await context.waitForEvent('serviceworker', { predicate: isOurs }))
  await worker()

  return {
    context,
    site: (name, pathname = '/') => `http://${name}.test:${port}${pathname}`,
    async setRules(rules) {
      const store = {
        version: 1,
        rules: rules.map((r, i) => ({
          id: String(i),
          enabled: true,
          createdAt: i,
          ...r,
        })),
      }
      await (await worker()).evaluate((s) => chrome.storage.local.set({ store: s }), store)
    },
    async tabs() {
      const all = await (await worker()).evaluate(() => chrome.tabs.query({}))
      return all
        .filter((t) => t.url?.includes('.test:'))
        .map((t) => ({
          id: t.id!,
          windowId: t.windowId,
          url: t.url!,
          active: t.active,
        }))
    },
    async openExternal(url, options = {}) {
      await (await worker()).evaluate(
        (props) => chrome.tabs.create(props).then(() => {}),
        { url, ...options },
      )
    },
    async newWindow(url) {
      const id = await (await worker()).evaluate(
        (u) => chrome.windows.create({ url: u }).then((w) => w!.id!),
        url,
      )
      return id
    },
    async stopServiceWorker() {
      const page = context.pages()[0]
      if (!page) throw new Error('a page is needed to reach the worker')
      const cdp = await context.newCDPSession(page)
      const stopped = new Promise<void>((resolve) => {
        cdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
          if (versions.some((v) => v.runningStatus === 'stopped')) resolve()
        })
      })
      await cdp.send('ServiceWorker.enable')
      await cdp.send('ServiceWorker.stopAllWorkers')
      await stopped
      await cdp.detach()
    },
    async close() {
      await context.close()
      await new Promise((resolve) => server.close(resolve))
      await rm(userDataDir, { recursive: true, force: true })
    },
  }
}
