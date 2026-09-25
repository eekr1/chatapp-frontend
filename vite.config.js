import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const releaseManifest = JSON.parse(readFileSync(new URL('./release/talkx-release.json', import.meta.url), 'utf8'))
const appVersion = String(packageJson.version || '').trim() || 'unknown'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'talkx-release-manifest',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'release-manifest.json',
          source: `${JSON.stringify(releaseManifest, null, 2)}\n`,
        })
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __RELEASE_ID__: JSON.stringify(releaseManifest.releaseId),
  },
})
