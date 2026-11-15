import { beforeEach, describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import {
  addRule,
  getRules,
  getStore,
  matchRule,
  migrate,
  removeRule,
  saveRules,
  STORE_KEY,
  updateRule,
  type Rule,
} from '@/lib/rules'

function rule(pattern: string, extra: Partial<Rule> = {}): Rule {
  return {
    id: pattern,
    pattern,
    enabled: true,
    createdAt: 1,
    ...extra,
  }
}

describe('migrate', () => {
  it('returns an empty store for missing or broken data', () => {
    const empty = { version: 1, rules: [] }
    expect(migrate(undefined)).toEqual(empty)
    expect(migrate(null)).toEqual(empty)
    expect(migrate('garbage')).toEqual(empty)
    expect(migrate({ version: 1 })).toEqual(empty)
    expect(migrate({ version: 1, rules: 'nope' })).toEqual(empty)
  })

  it('keeps valid rules as they are', () => {
    const rules = [rule('https://discord.com/*', { enabled: false })]
    expect(migrate({ version: 1, rules })).toEqual({ version: 1, rules })
  })

  it('drops rules with an invalid pattern and fills in defaults', () => {
    const store = migrate({
      version: 1,
      rules: [
        { pattern: 'not a pattern' },
        null,
        { pattern: 'https://a.test/*', action: 'focus', enabled: false },
      ],
    })
    expect(store.rules).toHaveLength(1)
    expect(store.rules[0]).toMatchObject({
      pattern: 'https://a.test/*',
      enabled: false,
    })
    // Fields from older versions are dropped.
    expect(store.rules[0]).not.toHaveProperty('action')
    expect(store.rules[0]?.id).toBeTruthy()
    expect(store.rules[0]?.createdAt).toBeTypeOf('number')
  })

  it('stamps the current version on unversioned data', () => {
    expect(migrate({ rules: [rule('https://a.test/*')] }).version).toBe(1)
  })
})

describe('storage', () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it('starts empty', async () => {
    expect(await getRules()).toEqual([])
  })

  it('round-trips rules with a version', async () => {
    const rules = [rule('https://a.test/*'), rule('https://b.test/*')]
    await saveRules(rules)
    expect(await getStore()).toEqual({ version: 1, rules })
    const raw = await fakeBrowser.storage.local.get(STORE_KEY)
    expect(raw[STORE_KEY]).toEqual({ version: 1, rules })
  })

  it('adds rules in order', async () => {
    const a = await addRule('https://a.test/*')
    const b = await addRule('https://b.test/*')
    expect(a.enabled).toBe(true)
    expect(a.id).not.toBe(b.id)
    expect((await getRules()).map((r) => r.pattern)).toEqual([
      'https://a.test/*',
      'https://b.test/*',
    ])
  })

  it('re-enables an existing rule instead of duplicating it', async () => {
    const a = await addRule('https://a.test/*')
    await updateRule(a.id, { enabled: false })
    const again = await addRule('https://a.test/*')
    expect(again.id).toBe(a.id)
    const rules = await getRules()
    expect(rules).toHaveLength(1)
    expect(rules[0]?.enabled).toBe(true)
  })

  it('rejects an invalid pattern', async () => {
    await expect(addRule('nope')).rejects.toThrow()
    expect(await getRules()).toEqual([])
  })

  it('updates and removes by id', async () => {
    const a = await addRule('https://a.test/*')
    const b = await addRule('https://b.test/*')
    await updateRule(a.id, { enabled: false })
    expect((await getRules())[0]?.enabled).toBe(false)
    const rest = await removeRule(a.id)
    expect(rest.map((r) => r.id)).toEqual([b.id])
    expect(await getRules()).toEqual(rest)
  })
})

describe('matchRule', () => {
  it('returns the first matching rule', () => {
    const rules = [
      rule('https://discord.com/channels/*'),
      rule('https://discord.com/*'),
    ]
    expect(matchRule(rules, 'https://discord.com/channels/1')?.pattern).toBe(
      'https://discord.com/channels/*',
    )
    expect(matchRule(rules, 'https://discord.com/invite/x')?.pattern).toBe(
      'https://discord.com/*',
    )
  })

  it('skips disabled rules', () => {
    const rules = [
      rule('https://discord.com/channels/*', { enabled: false }),
      rule('https://discord.com/*'),
    ]
    expect(matchRule(rules, 'https://discord.com/channels/1')?.pattern).toBe(
      'https://discord.com/*',
    )
    expect(
      matchRule([rule('https://a.test/*', { enabled: false })], 'https://a.test/'),
    ).toBeUndefined()
  })

  it('returns undefined when nothing matches', () => {
    expect(matchRule([rule('https://a.test/*')], 'https://b.test/')).toBe(
      undefined,
    )
  })
})
