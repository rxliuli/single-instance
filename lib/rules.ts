import { browser } from 'wxt/browser'
import { isValidPattern, matches } from './match'

export interface Rule {
  id: string
  /** Match pattern, e.g. `https://discord.com/*`. */
  pattern: string
  enabled: boolean
  createdAt: number
}

export interface Store {
  version: 1
  rules: Rule[]
}

export const STORE_KEY = 'store'
export const STORE_VERSION = 1

function emptyStore(): Store {
  return { version: STORE_VERSION, rules: [] }
}

function sanitizeRule(raw: unknown): Rule | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.pattern !== 'string' || !isValidPattern(r.pattern)) return null
  return {
    id: typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID(),
    pattern: r.pattern,
    enabled: r.enabled !== false,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
  }
}

/**
 * Turns whatever is in storage into a valid current-version store. Unknown or
 * broken data degrades to fewer rules instead of throwing: a background
 * script that cannot read its rules would silently stop working.
 */
export function migrate(raw: unknown): Store {
  if (!raw || typeof raw !== 'object') return emptyStore()
  const data = raw as { version?: unknown; rules?: unknown }
  // Future migrations go here: `if (data.version === 1) { ...; version = 2 }`.
  const rules = Array.isArray(data.rules) ? data.rules : []
  return {
    version: STORE_VERSION,
    rules: rules.map(sanitizeRule).filter((r): r is Rule => r !== null),
  }
}

export async function getStore(): Promise<Store> {
  const data = await browser.storage.local.get(STORE_KEY)
  return migrate(data[STORE_KEY])
}

export async function getRules(): Promise<Rule[]> {
  return (await getStore()).rules
}

export async function saveRules(rules: Rule[]): Promise<void> {
  const store: Store = { version: STORE_VERSION, rules }
  await browser.storage.local.set({ [STORE_KEY]: store })
}

export function createRule(pattern: string): Rule {
  return {
    id: crypto.randomUUID(),
    pattern,
    enabled: true,
    createdAt: Date.now(),
  }
}

/** Adds a rule, or re-enables the existing one with the same pattern. */
export async function addRule(pattern: string): Promise<Rule> {
  if (!isValidPattern(pattern)) throw new Error(`Invalid pattern: ${pattern}`)
  const rules = await getRules()
  const existing = rules.find((r) => r.pattern === pattern)
  if (existing) {
    existing.enabled = true
    await saveRules(rules)
    return existing
  }
  const rule = createRule(pattern)
  await saveRules([...rules, rule])
  return rule
}

export async function updateRule(
  id: string,
  patch: Partial<Pick<Rule, 'enabled'>>,
): Promise<void> {
  const rules = await getRules()
  await saveRules(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)))
}

/** Removes a rule and returns the rules that are left. */
export async function removeRule(id: string): Promise<Rule[]> {
  const rest = (await getRules()).filter((r) => r.id !== id)
  await saveRules(rest)
  return rest
}

/** The first enabled rule matching the URL, in the order rules were added. */
export function matchRule(rules: Rule[], url: string): Rule | undefined {
  return rules.find((r) => r.enabled && matches(r.pattern, url))
}

/** Calls back whenever the stored rules change. Returns an unsubscribe. */
export function onRulesChanged(callback: (rules: Rule[]) => void): () => void {
  const listener = (
    changes: Record<string, { newValue?: unknown }>,
    area: string,
  ) => {
    if (area === 'local' && STORE_KEY in changes) {
      callback(migrate(changes[STORE_KEY].newValue).rules)
    }
  }
  browser.storage.onChanged.addListener(listener)
  return () => browser.storage.onChanged.removeListener(listener)
}
