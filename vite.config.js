import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { createSyncServer } from './server/syncServer.js'

// https://vite.dev/config/
//
// `base` must match the public URL the app is served from. GitHub Pages
// hosts the deploy repo at https://anmolgritsa.github.io/Suab-deploy/, so
// every built asset URL is prefixed with /Suab-deploy/ (see DEPLOY.md).
// Local dev, `vite preview` and the browser test scripts keep working —
// they read the resolved URL from the Vite server, which already includes
// the base path.
//
// Cross-browser sync: the dev server also mounts a tiny JSON API
// (GET/PUT /api/db + SSE /api/db/events, persisted to .data/db.json) so
// attendance marked in one browser reaches dashboards open in OTHER
// browsers, which localStorage alone can never do. Same handler runs
// standalone via `npm run sync-server` outside dev.
// Mount the sync API on a connect-style middleware stack. It must match
// BOTH the bare path (/api/db) and the base-prefixed path
// (/Suab-deploy/api/db), because the browser sync bridge (src/data/
// syncBridge.js) builds its endpoint from BASE_URL — so the client calls
// the base-prefixed form. Without accepting that form, `vite preview` and
// any base-served build return 404 for check-in/sync and cross-browser
// sync silently breaks. We strip an optional leading base segment before
// handing to the handler, so the one handler serves dev, preview, and
// standalone consistently.
function mountSyncApi(middlewares, sync, base) {
  const prefix = base.endsWith('/') ? base.slice(0, -1) : base // '/Suab-deploy'
  middlewares.use((req, res, next) => {
    if (!req.url) return next()
    // Strip an optional base prefix so both /api/db and
    // /Suab-deploy/api/db reach the handler as /api/db.
    let url = req.url
    if (prefix && url.startsWith(prefix + '/')) url = url.slice(prefix.length)
    if (!url.startsWith('/api/')) return next()
    const original = req.url
    req.url = url
    sync
      .handler(req, res)
      .catch(() => false)
      .then((handled) => {
        req.url = original
        if (!handled) next()
      })
  })
}

function syncServerPlugin(base = '/') {
  const label = (file) =>
    `[sync-server] cross-browser sync API mounted on ${base}api/db (file: ${file})`
  return {
    name: 'suab-sync-server',
    // Dev server (`npm run dev`).
    async configureServer(server) {
      const sync = await createSyncServer()
      mountSyncApi(server.middlewares, sync, base)
      console.log(label('.data/db.json'))
    },
    // Preview server (`npm run preview` / `vite preview`): serves the
    // production build; without this hook it is a pure static server and
    // /Suab-deploy/api/db 404s — exactly the reported check-in failure.
    async configurePreviewServer(server) {
      const sync = await createSyncServer()
      mountSyncApi(server.middlewares, sync, base)
      console.log(label('.data/db.json'))
    },
  }
}

export default defineConfig(() => {
  const base = '/Suab-deploy/'
  return {
    base,
    // `vite preview` only runs the preview server, so configurePreviewServer
    // is what mounts the API there; `vite dev` uses configureServer. The base
    // is passed so the middleware accepts both /api/... and /Suab-deploy/api/...
    // regardless of which URL form the client used.
    plugins: [react(), syncServerPlugin(base)],
  }
})
