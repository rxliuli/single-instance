/**
 * Match pattern parsing and matching. Pure functions, no `browser.*`.
 *
 * Rules use the extension match pattern syntax (`<scheme>://<host>/<path>`) so
 * the same string drives both URL matching and host permission requests.
 * Only http(s) is supported: those are the only origins the manifest lets the
 * extension ask for.
 */

export interface ParsedPattern {
  /** `*` means http or https. */
  scheme: '*' | 'http' | 'https'
  /** `*`, `*.example.com` or `example.com`, lowercased. */
  host: string
  /** Starts with `/`, may contain `*` wildcards. */
  path: string
}

const PATTERN_RE = /^(\*|https?):\/\/([^/]+)(\/.*)$/i
const HOST_LABEL_RE = /^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?$/

export function parsePattern(pattern: string): ParsedPattern | null {
  const m = PATTERN_RE.exec(pattern.trim())
  if (!m) return null
  const scheme = m[1]!.toLowerCase() as ParsedPattern['scheme']
  const host = m[2]!.toLowerCase()
  const path = m[3]!
  if (!isValidHost(host)) return null
  if (/[\s#]/.test(path)) return null
  return { scheme, host, path }
}

function isValidHost(host: string): boolean {
  if (host === '*') return true
  // `*` is only allowed as the whole host or as a leading `*.` label.
  const rest = host.startsWith('*.') ? host.slice(2) : host
  if (!rest || rest.includes('*')) return false
  // A port is not part of a match pattern; a rule applies to every port.
  if (rest.includes(':') || rest.includes('@')) return false
  return rest.split('.').every((label) => HOST_LABEL_RE.test(label))
}

export function isValidPattern(pattern: string): boolean {
  return parsePattern(pattern) !== null
}

function matchesHost(patternHost: string, host: string): boolean {
  if (patternHost === '*') return true
  if (patternHost.startsWith('*.')) {
    const base = patternHost.slice(2)
    return host === base || host.endsWith('.' + base)
  }
  return host === patternHost
}

function globToRegExp(glob: string): RegExp {
  const source = glob
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${source}$`)
}

export function matches(pattern: string, url: string): boolean {
  const parsed = parsePattern(pattern)
  if (!parsed) return false
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  const scheme = u.protocol.slice(0, -1)
  if (scheme !== 'http' && scheme !== 'https') return false
  if (parsed.scheme !== '*' && parsed.scheme !== scheme) return false
  if (!matchesHost(parsed.host, u.hostname.toLowerCase())) return false
  // Like the browser, match against path + query and ignore the fragment.
  return globToRegExp(parsed.path).test(u.pathname + u.search)
}

/**
 * The origin-level pattern (`scheme://host/*`) used for permission calls.
 * Host permissions ignore the path, so two rules on the same host share one.
 */
export function originPattern(pattern: string): string | null {
  const parsed = parsePattern(pattern)
  if (!parsed) return null
  return `${parsed.scheme}://${parsed.host}/*`
}

/** The whole-site pattern for a page URL, or null if it is not http(s). */
export function patternFromUrl(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const pattern = `${u.protocol}//${u.hostname.toLowerCase()}/*`
  return isValidPattern(pattern) ? pattern : null
}

/**
 * Turns what a user types into a match pattern: `discord.com` becomes
 * `https://discord.com/*`. Input that is already a pattern passes through.
 * Returns null when the result is not a valid pattern.
 */
export function normalizePatternInput(input: string): string | null {
  let value = input.trim()
  if (!value) return null
  if (!/^(\*|[a-z][a-z0-9+.-]*):\/\//i.test(value)) value = 'https://' + value
  const schemeEnd = value.indexOf('://') + 3
  const slash = value.indexOf('/', schemeEnd)
  if (slash === -1) value += '/*'
  else if (slash === value.length - 1) value += '*'
  const parsed = parsePattern(value)
  if (!parsed) return null
  return `${parsed.scheme}://${parsed.host}${parsed.path}`
}
