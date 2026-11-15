import { useState, type FormEvent } from 'react'
import { ShieldCheckIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { normalizePatternInput } from '@/lib/match'
import { releaseFor, requestFor } from '@/lib/permissions'
import { addRule, removeRule, updateRule, type Rule } from '@/lib/rules'
import { useGranted, useRules } from '@/lib/use-rules'

function AddRuleForm(props: { rules: Rule[] }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault()
    const pattern = normalizePatternInput(input)
    if (!pattern) {
      return setError(
        'Enter a site such as discord.com, or a match pattern such as https://*.example.com/*.',
      )
    }
    if (props.rules.some((r) => r.pattern === pattern)) {
      return setError('This rule already exists.')
    }
    // Validation above is synchronous on purpose: the permission request
    // has to happen inside the click, before anything is awaited.
    const request = requestFor(pattern).catch(() => false)
    setError('')
    void request.then(async (ok) => {
      if (!ok) {
        return setError(
          'The rule was not added because access to the site was not granted.',
        )
      }
      await addRule(pattern)
      setInput('')
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="flex gap-2">
        <Input
          className="min-w-0 flex-1"
          value={input}
          onChange={(ev) => {
            setInput(ev.target.value)
            setError('')
          }}
          placeholder="discord.com or https://*.example.com/*"
          aria-label="Site or match pattern"
          aria-invalid={!!error}
          inputMode="url"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <Button type="submit" disabled={!input.trim()}>
          Add
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </form>
  )
}

function RuleRow(props: { rule: Rule; granted: boolean | undefined }) {
  const { rule, granted } = props
  const onDelete = async () => {
    const rest = await removeRule(rule.id)
    await releaseFor(rule.pattern, rest)
  }
  return (
    <li className="space-y-2 py-3">
      <div className="flex items-center gap-2">
        <Switch
          checked={rule.enabled}
          onCheckedChange={(enabled) => void updateRule(rule.id, { enabled })}
          aria-label="Enabled"
        />
        {/* Wraps instead of truncating so a long pattern stays readable on a phone. */}
        <code
          className={
            'min-w-0 flex-1 text-sm break-all' +
            (rule.enabled ? '' : ' text-muted-foreground')
          }
        >
          {rule.pattern}
        </code>
        {granted === false && (
          <Badge variant="destructive">
            <TriangleAlertIcon />
            Needs access
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void onDelete()}
          aria-label="Delete"
          title="Delete"
        >
          <Trash2Icon />
        </Button>
      </div>
      {granted === false && (
        <div className="flex flex-wrap items-center justify-between gap-2 pl-10">
          <p className="text-muted-foreground text-sm">
            Access to this site was removed, so this rule is not working.
          </p>
          <Button
            variant="outline"
            size="sm"
            // Called directly in the click handler: see requestFor.
            onClick={() => void requestFor(rule.pattern).catch(() => false)}
          >
            Grant access
          </Button>
        </div>
      )}
    </li>
  )
}

export function App() {
  const rules = useRules()
  const granted = useGranted(rules)
  if (!rules) return null

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Single Instance</h1>
        <p className="text-muted-foreground text-sm">
          Sites listed here stay in one tab. A link opened from elsewhere goes
          to the tab you already have, and the new tab is closed.
        </p>
      </header>

      <AddRuleForm rules={rules} />

      {rules.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          No rules yet. Add a site above, or open the site and use the toolbar
          button.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border px-3">
          {rules.map((rule) => (
            <RuleRow key={rule.id} rule={rule} granted={granted[rule.id]} />
          ))}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheckIcon className="size-4" />
            What this extension can see
          </CardTitle>
          <CardDescription>
            The address and title of tabs on the sites listed above, so it can
            find the tab you already have.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            It cannot see tabs on any other site, cannot read or change the
            content of any page, and never connects to the network. Your rules
            are stored only on this device.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
