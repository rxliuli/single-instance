import { useEffect, useState } from 'react'
import { hasPermission, onPermissionsChanged } from './permissions'
import { getRules, onRulesChanged, type Rule } from './rules'

/** The stored rules, kept in sync. `undefined` while loading. */
export function useRules(): Rule[] | undefined {
  const [rules, setRules] = useState<Rule[]>()
  useEffect(() => {
    void getRules().then(setRules)
    return onRulesChanged(setRules)
  }, [])
  return rules
}

/**
 * Which rules currently have site access, by rule id. A rule missing from the
 * result has not been checked yet. Re-checks when access is granted or
 * revoked, including from the browser's own settings.
 */
export function useGranted(rules: Rule[] | undefined): Record<string, boolean> {
  const [granted, setGranted] = useState<Record<string, boolean>>({})
  useEffect(() => {
    if (!rules) return
    let cancelled = false
    const check = async () => {
      const entries = await Promise.all(
        rules.map(async (r) => [r.id, await hasPermission(r.pattern)] as const),
      )
      if (!cancelled) setGranted(Object.fromEntries(entries))
    }
    void check()
    const unsubscribe = onPermissionsChanged(() => void check())
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [rules])
  return granted
}
