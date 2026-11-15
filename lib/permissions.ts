import { browser } from 'wxt/browser'
import { originPattern } from './match'
import type { Rule } from './rules'

/**
 * Asks for access to the site a pattern covers.
 *
 * Must be called synchronously inside a user gesture handler: do not `await`
 * anything before it, or the browser rejects the request.
 */
export function requestFor(pattern: string): Promise<boolean> {
  const origin = originPattern(pattern)
  if (!origin) return Promise.resolve(false)
  return browser.permissions.request({ origins: [origin] })
}

export async function hasPermission(pattern: string): Promise<boolean> {
  const origin = originPattern(pattern)
  if (!origin) return false
  try {
    return await browser.permissions.contains({ origins: [origin] })
  } catch {
    return false
  }
}

/**
 * Gives back the site access a removed rule was using, unless one of the
 * remaining rules still needs the same origin.
 */
export async function releaseFor(
  pattern: string,
  remaining: Rule[],
): Promise<void> {
  const origin = originPattern(pattern)
  if (!origin) return
  if (remaining.some((r) => originPattern(r.pattern) === origin)) return
  try {
    await browser.permissions.remove({ origins: [origin] })
  } catch {
    // Not granted, or granted through the manifest: nothing to release.
  }
}

/** Calls back when site access is granted or revoked. Returns unsubscribe. */
export function onPermissionsChanged(callback: () => void): () => void {
  browser.permissions.onAdded.addListener(callback)
  browser.permissions.onRemoved.addListener(callback)
  return () => {
    browser.permissions.onAdded.removeListener(callback)
    browser.permissions.onRemoved.removeListener(callback)
  }
}
