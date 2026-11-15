# Single Instance

Keep each site you choose in a single tab. When a link to that site is opened from somewhere else, it opens in the tab you already have and the new tab is closed.

Built for web apps that misbehave with a second tab: Discord asking you to log in again, WhatsApp Web's single session, heavy apps such as Slack or Figma, music sites playing twice.

## How it works

- Open a site, click the toolbar button, and turn on "Keep this site in one tab". Or add sites on the options page.
- Each rule is a [match pattern](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns) such as `https://discord.com/*`.
- Only a new tab's first navigation is ever intercepted. Tabs opened from the site itself (Ctrl/Cmd+click, middle click) and popup windows (OAuth) are left alone.

## Permissions

Installing shows no permission warning. The extension asks for `storage` and `activeTab` only, and requests access to a site when you add a rule for it. It never asks for `tabs`, `webNavigation` or `scripting`, and it has no content scripts, so it cannot read page content and cannot see tabs on sites without a rule.

## Development

```sh
pnpm i
pnpm dev          # Chrome, output in .output/chrome-mv3-dev
pnpm compile      # type check
pnpm test:unit    # pure logic and storage
pnpm test:e2e     # real Chromium with the extension loaded
```

The end-to-end tests build a test variant (`pnpm build:e2e`) that is granted every site in its manifest, because a test cannot click the browser's permission prompt. They need Playwright's Chromium: `pnpm exec playwright install chromium`.

```
entrypoints/
  background.ts     event listeners, interception and merging
  popup/            switch for the current site
  options/          rule list
lib/
  match.ts          match pattern parsing and matching (pure)
  pick-target.ts    choosing the tab to merge into (pure)
  rules.ts          rule storage and migration
  permissions.ts    requesting and releasing site access
tests/
  unit/
  e2e/
```

## Build

```sh
pnpm zip && pnpm zip:firefox
pnpm build:safari   # macOS with Xcode
```
