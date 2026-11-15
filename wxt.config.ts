import { defineConfig, type UserManifest } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  modules: ['@wxt-dev/module-react', '@extport/wxt'],
  extport: {
    extension: 'ext_nd0ncREOnwkvbKMRzRtD',
    analytics: true,
    // Publishing to Safari? Uncomment and fill in your own values —
    // extport.config.json is generated from these at `wxt prepare`.
    safari: {
      appCategory: 'public.app-category.productivity',
      bundleIdentifier: 'com.rxliuli.single-instance',
      developmentTeam: 'N2X78TUUFG',
      issuerId: '48f39427-c063-4e33-98d2-31de80aad0be',
      keyId: '8N27UWG9RG',
      openProject: true,
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      tsconfigPaths: true,
    },
  }),
  manifestVersion: 3,
  manifest: (env) => {
    const manifest: UserManifest = {
      name: 'Single Instance – Open links in existing tab',
      description:
        'Keep each site you choose in a single tab by opening its links in the tab you already have.',
      // No `tabs`, `webNavigation` or `scripting`: site access is requested
      // per rule, so installing shows no permission warning.
      permissions: ['storage', 'activeTab'],
      optional_host_permissions: ['https://*/*', 'http://*/*'],
      author: {
        email: 'rxliuli@gmail.com',
      },
      action: {
        default_icon: {
          '16': 'icon/16.png',
          '32': 'icon/32.png',
          '48': 'icon/48.png',
          '96': 'icon/96.png',
          '128': 'icon/128.png',
        },
      },
      homepage_url: 'https://rxliuli.com/project/single-instance',
    }
    if (env.mode === 'e2e') {
      // Tests cannot click the permission prompt, so the test build
      // (`wxt build --mode e2e`) is granted every site up front.
      manifest.host_permissions = ['<all_urls>']
    }
    if (env.browser === 'firefox') {
      manifest.browser_specific_settings = {
        gecko: {
          id: 'single-instance@rxliuli.com',
          data_collection_permissions: {
            required: ['none'],
          },
        },
        // Empty = compatible with Firefox for Android at AMO's default
        // minimum — compatibility is a property of the build, not a
        // submission-time checkbox.
        gecko_android: {},
      }
      // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/author
      // @ts-expect-error
      manifest.author = 'rxliuli'
    }
    if (env.browser === 'safari') {
      manifest.name = 'Single Instance'
    }
    return manifest
  },
  webExt: {
    disabled: true,
  },
})
