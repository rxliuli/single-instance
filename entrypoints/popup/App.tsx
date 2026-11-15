import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { matches, patternFromUrl } from '@/lib/match'
import { releaseFor, requestFor } from '@/lib/permissions'
import { createRule, saveRules } from '@/lib/rules'
import { useGranted, useRules } from '@/lib/use-rules'

/** The active tab's URL. `activeTab` makes it readable once the popup opens. */
function useActiveUrl(): string | null | undefined {
  const [url, setUrl] = useState<string | null>()
  useEffect(() => {
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => setUrl(tab?.url ?? null))
  }, [])
  return url
}

export function App() {
  const url = useActiveUrl()
  const rules = useRules()
  const granted = useGranted(rules)

  if (url === undefined || !rules) return <div className="h-24 min-w-80" />

  const sitePattern = url ? patternFromUrl(url) : null
  // The switch speaks for the rule that would apply to this page, which is
  // the first match, enabled or not.
  const rule = url ? rules.find((r) => matches(r.pattern, url)) : undefined
  const hasAccess = rule ? granted[rule.id] : undefined
  const checked = !!rule && rule.enabled && hasAccess === true

  const onToggle = (next: boolean) => {
    if (!sitePattern) return
    if (!next) {
      if (!rule) return
      const rest = rules.filter((r) => r.id !== rule.id)
      void saveRules(rest).then(() => releaseFor(rule.pattern, rest))
      return
    }
    // Nothing may be awaited before the permission request, or it is no
    // longer part of the click. The rule is also saved before the answer
    // arrives: Firefox closes the popup while its prompt is open, so code
    // after the answer may never run.
    const pattern = rule?.pattern ?? sitePattern
    const request = requestFor(pattern).catch(() => false)
    const added = rule ? undefined : createRule(pattern)
    const next_ = added
      ? [...rules, added]
      : rules.map((r) => (r.id === rule!.id ? { ...r, enabled: true } : r))
    void saveRules(next_).then(async () => {
      if (added && !(await request)) {
        await saveRules(next_.filter((r) => r.id !== added.id))
      }
    })
  }

  // Sizes are tuned for a desktop popup. On a touch screen the popup is a
  // full-width sheet, where the same sizes read as too small.
  return (
    <div className="min-w-80 space-y-3 p-4 text-sm pointer-coarse:text-base">
      {sitePattern ? (
        <>
          <div className="truncate font-medium" title={url ?? ''}>
            {new URL(url!).hostname}
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <Label htmlFor="single" className="pointer-coarse:text-base">
                Keep this site in one tab
              </Label>
              <p className="text-muted-foreground text-xs pointer-coarse:text-sm">
                {rule && rule.enabled && hasAccess === false
                  ? 'Access to this site was removed. Turn the switch on again to restore it.'
                  : 'Links to this site open in the tab you already have.'}
              </p>
            </div>
            <Switch id="single" checked={checked} onCheckedChange={onToggle} />
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">
          This page can't be kept in a single tab.
        </p>
      )}
      <Button
        variant="link"
        className="h-auto p-0 text-xs pointer-coarse:text-sm"
        onClick={() => void browser.runtime.openOptionsPage()}
      >
        Manage all rules
      </Button>
    </div>
  )
}
