import { describe, expect, it } from 'vitest'
import {
  isValidPattern,
  matches,
  normalizePatternInput,
  originPattern,
  parsePattern,
  patternFromUrl,
} from '@/lib/match'

describe('parsePattern', () => {
  it('parses scheme, host and path', () => {
    expect(parsePattern('https://discord.com/*')).toEqual({
      scheme: 'https',
      host: 'discord.com',
      path: '/*',
    })
    expect(parsePattern('*://*.Example.com/a/*')).toEqual({
      scheme: '*',
      host: '*.example.com',
      path: '/a/*',
    })
    expect(parsePattern('http://*/')).toEqual({
      scheme: 'http',
      host: '*',
      path: '/',
    })
  })

  it.each([
    '',
    'discord.com',
    'https://discord.com',
    'https:///path',
    'ftp://example.com/*',
    'file:///tmp/*',
    'chrome://extensions/*',
    '<all_urls>',
    'https://*discord.com/*',
    'https://discord.*.com/*',
    'https://discord.*/*',
    'https://*./*',
    'https://example.com:8080/*',
    'https://user@example.com/*',
    'https://exa mple.com/*',
    'https://example..com/*',
    'https://example.com/a#b',
  ])('rejects %j', (pattern) => {
    expect(parsePattern(pattern)).toBeNull()
    expect(isValidPattern(pattern)).toBe(false)
  })
})

describe('matches', () => {
  it('matches an exact host on any path', () => {
    const p = 'https://discord.com/*'
    expect(matches(p, 'https://discord.com/')).toBe(true)
    expect(matches(p, 'https://discord.com/channels/1/2?x=1#y')).toBe(true)
    expect(matches(p, 'https://DISCORD.com/app')).toBe(true)
    expect(matches(p, 'http://discord.com/')).toBe(false)
    expect(matches(p, 'https://ptb.discord.com/')).toBe(false)
    expect(matches(p, 'https://notdiscord.com/')).toBe(false)
    expect(matches(p, 'https://discord.com.evil.test/')).toBe(false)
  })

  it('matches subdomains and the bare domain with a leading wildcard', () => {
    const p = 'https://*.slack.com/*'
    expect(matches(p, 'https://slack.com/')).toBe(true)
    expect(matches(p, 'https://app.slack.com/client')).toBe(true)
    expect(matches(p, 'https://a.b.slack.com/')).toBe(true)
    expect(matches(p, 'https://myslack.com/')).toBe(false)
  })

  it('treats a * scheme as http or https only', () => {
    const p = '*://example.com/*'
    expect(matches(p, 'http://example.com/')).toBe(true)
    expect(matches(p, 'https://example.com/')).toBe(true)
    expect(matches(p, 'ftp://example.com/')).toBe(false)
  })

  it('matches every host with *', () => {
    expect(matches('https://*/*', 'https://anything.test/x')).toBe(true)
    expect(matches('https://*/*', 'http://anything.test/x')).toBe(false)
  })

  it('applies path wildcards to the path and query', () => {
    const p = 'https://www.figma.com/file/*'
    expect(matches(p, 'https://www.figma.com/file/abc')).toBe(true)
    expect(matches(p, 'https://www.figma.com/file/abc?node=1')).toBe(true)
    expect(matches(p, 'https://www.figma.com/files')).toBe(false)
    expect(matches(p, 'https://www.figma.com/')).toBe(false)
    expect(matches('https://a.test/x', 'https://a.test/x')).toBe(true)
    expect(matches('https://a.test/x', 'https://a.test/x#frag')).toBe(true)
    expect(matches('https://a.test/x', 'https://a.test/xy')).toBe(false)
    expect(matches('https://a.test/*/edit', 'https://a.test/1/2/edit')).toBe(
      true,
    )
  })

  it('does not treat regex characters in the path as special', () => {
    expect(matches('https://a.test/a.b', 'https://a.test/aXb')).toBe(false)
    expect(matches('https://a.test/a+(b)', 'https://a.test/a+(b)')).toBe(true)
  })

  it('ignores the port', () => {
    expect(matches('http://localhost/*', 'http://localhost:3000/x')).toBe(true)
  })

  it('returns false for invalid patterns and non-web URLs', () => {
    expect(matches('nonsense', 'https://a.test/')).toBe(false)
    expect(matches('https://*/*', 'not a url')).toBe(false)
    expect(matches('https://*/*', 'about:blank')).toBe(false)
    expect(matches('*://*/*', 'chrome://newtab/')).toBe(false)
  })
})

describe('originPattern', () => {
  it('drops the path', () => {
    expect(originPattern('https://www.figma.com/file/*')).toBe(
      'https://www.figma.com/*',
    )
    expect(originPattern('*://*.slack.com/*')).toBe('*://*.slack.com/*')
    expect(originPattern('nope')).toBeNull()
  })
})

describe('patternFromUrl', () => {
  it('builds a whole-site pattern', () => {
    expect(patternFromUrl('https://discord.com/channels/1')).toBe(
      'https://discord.com/*',
    )
    expect(patternFromUrl('http://localhost:3000/x')).toBe('http://localhost/*')
  })

  it('returns null for pages that cannot have a rule', () => {
    expect(patternFromUrl('chrome://extensions/')).toBeNull()
    expect(patternFromUrl('about:blank')).toBeNull()
    expect(patternFromUrl('')).toBeNull()
  })
})

describe('normalizePatternInput', () => {
  it.each([
    ['discord.com', 'https://discord.com/*'],
    ['  Discord.com  ', 'https://discord.com/*'],
    ['discord.com/', 'https://discord.com/*'],
    ['discord.com/channels/*', 'https://discord.com/channels/*'],
    ['*.slack.com', 'https://*.slack.com/*'],
    ['http://localhost', 'http://localhost/*'],
    ['*://example.com/*', '*://example.com/*'],
    ['https://www.figma.com/file/*', 'https://www.figma.com/file/*'],
  ])('%j -> %j', (input, expected) => {
    expect(normalizePatternInput(input)).toBe(expected)
  })

  it.each(['', '   ', 'ftp://example.com', 'not a site', 'a b.com'])(
    'rejects %j',
    (input) => {
      expect(normalizePatternInput(input)).toBeNull()
    },
  )
})
